import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Api, AssistantMessage, AssistantMessageEvent, AssistantMessageEventStream, Context, Model, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { registerOAuthProvider, type OAuthCredentials, type OAuthLoginCallbacks, type OAuthProviderInterface } from "@earendil-works/pi-ai/oauth";

import { KIRO_API, type ExtensionConfig, type KiroOAuthConfig, loadConfig } from "./config.js";
import { DebugLogger } from "./debug-logger.js";
import type { DebugLogger as DebugLoggerInstance } from "./debug-logger.js";
import { omitAuthorizationHeaders } from "./headers.js";

const EXTENSION_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RUNTIME_PROVIDER_REGISTRATION_EVENT = "pi-multi-auth:runtime-provider-registration";
const MULTI_AUTH_PROVIDERS_REGISTERED_EVENT = "pi-multi-auth:providers-registered";
const KIRO_PROFILE_ARN_HEADER = "x-kiro-profile-arn";

type KiroRuntimeState = { cwd?: string };
type KiroStreamModule = typeof import("./kiro.js");
type KiroOAuthModule = typeof import("./oauth.js");
type KiroStreamSimple = (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => AssistantMessageEventStream;

let kiroStreamModule: KiroStreamModule | undefined;
let kiroStreamModulePromise: Promise<KiroStreamModule> | undefined;
let kiroOAuthModule: KiroOAuthModule | undefined;
let kiroOAuthModulePromise: Promise<KiroOAuthModule> | undefined;

function loadKiroStreamModule(): Promise<KiroStreamModule> {
  if (kiroStreamModule) return Promise.resolve(kiroStreamModule);
  kiroStreamModulePromise ??= import("./kiro.js").then((module) => {
    kiroStreamModule = module;
    return module;
  });
  return kiroStreamModulePromise;
}

function loadKiroOAuthModule(): Promise<KiroOAuthModule> {
  if (kiroOAuthModule) return Promise.resolve(kiroOAuthModule);
  kiroOAuthModulePromise ??= import("./oauth.js").then((module) => {
    kiroOAuthModule = module;
    return module;
  });
  return kiroOAuthModulePromise;
}

function createLazyKiroStream(config: ExtensionConfig, runtime: KiroRuntimeState, logger: DebugLoggerInstance): KiroStreamSimple {
  return (model, context, options) => {
    const streamPromise = loadKiroStreamModule()
      .then(({ createKiroStream }) => createKiroStream(config, runtime, logger)(model, context, options));
    streamPromise.catch(() => undefined);

    const lazyStream = {
      async *[Symbol.asyncIterator](): AsyncIterator<AssistantMessageEvent> {
        const stream = await streamPromise;
        yield* stream;
      },
      result(): Promise<AssistantMessage> {
        return streamPromise.then((stream) => stream.result());
      },
      push(event: AssistantMessageEvent): void {
        void streamPromise.then((stream) => stream.push(event), () => undefined);
      },
      end(result?: AssistantMessage): void {
        void streamPromise.then((stream) => stream.end(result), () => undefined);
      },
    };

    return lazyStream as unknown as AssistantMessageEventStream;
  };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function profileArnFromCredentials(credentials: OAuthCredentials): string | undefined {
  const profileArn = nonEmptyString(credentials.profileArn);
  if (profileArn) return profileArn;
  const request = credentials.request;
  if (!request || typeof request !== "object" || Array.isArray(request)) return undefined;
  const headers = (request as { headers?: unknown }).headers;
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) return undefined;
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() === KIRO_PROFILE_ARN_HEADER && typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function createLazyKiroOAuthProvider(config: KiroOAuthConfig, logger: DebugLoggerInstance, options: { providerId?: string; displayName?: string } = {}): OAuthProviderInterface {
  const providerId = nonEmptyString(options.providerId) ?? nonEmptyString(config.providerId) ?? "kiro";
  const displayName = nonEmptyString(options.displayName) ?? "Kiro";
  let oauthProvider: OAuthProviderInterface | undefined;
  let oauthProviderPromise: Promise<OAuthProviderInterface> | undefined;

  const loadProvider = (): Promise<OAuthProviderInterface> => {
    if (oauthProvider) return Promise.resolve(oauthProvider);
    oauthProviderPromise ??= loadKiroOAuthModule().then(({ createKiroOAuthProvider }) => {
      oauthProvider = createKiroOAuthProvider(config, logger, { providerId, displayName });
      return oauthProvider;
    });
    return oauthProviderPromise;
  };

  return {
    id: providerId,
    name: displayName,
    async login(callbacks: OAuthLoginCallbacks) {
      return (await loadProvider()).login(callbacks);
    },
    async refreshToken(credentials: OAuthCredentials) {
      return (await loadProvider()).refreshToken(credentials);
    },
    getApiKey(credentials: OAuthCredentials) {
      return credentials.access;
    },
    modifyModels(models, credentials) {
      const profileArn = profileArnFromCredentials(credentials);
      if (!profileArn) return models;
      return models.map((model) => ({
        ...model,
        headers: { ...(model.headers ?? {}), [KIRO_PROFILE_ARN_HEADER]: profileArn },
      }));
    },
  };
}

export default function kiroProviderExtension(pi: ExtensionAPI): void {
  const { config, warnings } = loadConfig(EXTENSION_ROOT);
  const logger = new DebugLogger({ extensionRoot: EXTENSION_ROOT, debug: config.debug });
  for (const warning of warnings) logger.warn("config_warning", { warning });

  if (!config.enabled) {
    logger.debug("extension_disabled", { providerId: config.providerId });
    return;
  }

  const oauthProvider = createLazyKiroOAuthProvider(config.oauth, logger, {
    providerId: config.providerId,
    displayName: config.displayName,
  });
  registerOAuthProvider(oauthProvider);

  const runtime: KiroRuntimeState = {};
  const streamSimple = createLazyKiroStream(config, runtime, logger);
  const providerHeaders = omitAuthorizationHeaders(config.headers);
  const providerModels = config.models.map((model) => ({
    ...model,
    ...(model.headers ? { headers: omitAuthorizationHeaders(model.headers) } : {}),
  }));
  let runtimeProviderRegistrationEmitted = false;
  const emitRuntimeProviderRegistration = (force = false): void => {
    if (runtimeProviderRegistrationEmitted && !force) {
      logger.debug("runtime_provider_registration_skipped", {
        providerId: config.providerId,
        reason: "already_emitted",
      });
      return;
    }
    if (!pi.events) return;
    pi.events.emit(RUNTIME_PROVIDER_REGISTRATION_EVENT, {
      provider: config.providerId,
      displayName: config.displayName,
      baseUrl: config.upstreamUrl,
      api: KIRO_API,
      authHeader: false,
      headers: { ...providerHeaders },
      models: providerModels.map((model) => ({ ...model, ...(model.headers ? { headers: { ...model.headers } } : {}) })),
      streamSimple,
    });
    runtimeProviderRegistrationEmitted = true;
    logger.debug("runtime_provider_registration_emitted", {
      providerId: config.providerId,
      api: KIRO_API,
      modelCount: config.models.length,
    });
  };

  pi.on("session_start", (_event, ctx) => {
    runtime.cwd = ctx.cwd;
    emitRuntimeProviderRegistration(true);
  });

  pi.on("before_agent_start", (_event, ctx) => {
    runtime.cwd = ctx.cwd;
    emitRuntimeProviderRegistration(true);
    return {};
  });

  pi.events?.on(MULTI_AUTH_PROVIDERS_REGISTERED_EVENT, () => {
    emitRuntimeProviderRegistration(true);
  });

  pi.registerProvider(config.providerId, {
    name: config.displayName,
    baseUrl: config.upstreamUrl,
    apiKey: config.apiKey,
    api: KIRO_API,
    authHeader: false,
    streamSimple,
    headers: providerHeaders,
    models: providerModels,
    oauth: {
      name: oauthProvider.name,
      login: (callbacks) => oauthProvider.login(callbacks),
      refreshToken: (credentials) => oauthProvider.refreshToken(credentials),
      getApiKey: (credentials) => oauthProvider.getApiKey(credentials),
      modifyModels: (models, credentials) => oauthProvider.modifyModels?.(models, credentials) ?? models,
    },
  });
  emitRuntimeProviderRegistration(true);

  logger.debug("provider_registered", {
    providerId: config.providerId,
    api: KIRO_API,
    upstreamUrl: config.upstreamUrl,
    modelCount: config.models.length,
  });
}
