import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerOAuthProvider } from "@earendil-works/pi-ai/oauth";

import { KIRO_API, loadConfig } from "./config.js";
import { DebugLogger } from "./debug-logger.js";
import { createKiroStream } from "./kiro.js";
import { createKiroOAuthProvider } from "./oauth.js";
import { omitAuthorizationHeaders } from "./headers.js";

const EXTENSION_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RUNTIME_PROVIDER_REGISTRATION_EVENT = "pi-multi-auth:runtime-provider-registration";
const MULTI_AUTH_PROVIDERS_REGISTERED_EVENT = "pi-multi-auth:providers-registered";

export default function kiroProviderExtension(pi: ExtensionAPI): void {
  const { config, warnings } = loadConfig(EXTENSION_ROOT);
  const logger = new DebugLogger({ extensionRoot: EXTENSION_ROOT, debug: config.debug });
  for (const warning of warnings) logger.warn("config_warning", { warning });

  if (!config.enabled) {
    logger.debug("extension_disabled", { providerId: config.providerId });
    return;
  }

  const oauthProvider = createKiroOAuthProvider(config.oauth, logger, {
    providerId: config.providerId,
    displayName: config.displayName,
  });
  registerOAuthProvider(oauthProvider);

  const runtime: { cwd?: string } = {};
  const streamSimple = createKiroStream(config, runtime, logger);
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
