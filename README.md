# pi-kiro-provider

[![npm version](https://img.shields.io/npm/v/pi-kiro-provider?style=flat-square)](https://www.npmjs.com/package/pi-kiro-provider) [![License](https://img.shields.io/github/license/MasuRii/pi-kiro-provider?style=flat-square)](LICENSE)

`pi-kiro-provider` is a Pi extension that registers Kiro as a streaming AI provider backed by Kiro's AWS CodeWhisperer-compatible API and OAuth flow.

- **Provider ID:** `kiro`
- **npm:** https://www.npmjs.com/package/pi-kiro-provider
- **GitHub:** https://github.com/MasuRii/pi-kiro-provider

## Features

- Registers the Kiro provider through Pi's provider API with `authHeader: false` so credentials stay managed by the OAuth provider path.
- Registers a Kiro OAuth provider with Builder ID, Google, and GitHub sign-in method labels.
- Replays runtime provider registration events for `pi-multi-auth` readiness and Pi session lifecycle events.
- Provides configurable model metadata, thinking-level mappings, prompt-caching metadata, request timeout, headers, and optional Kiro profile ARN support.
- Drops static `Authorization` header overrides so managed OAuth credentials cannot be bypassed by config.
- Writes optional debug logs only under the extension-local `debug/` directory when `debug` is enabled.

## Installation

### npm package

```bash
pi install npm:pi-kiro-provider
```

### Git repository

```bash
pi install git:github.com/MasuRii/pi-kiro-provider
```

### Local extension folder

Place this folder in one of Pi's extension discovery paths:

| Scope | Path |
|-------|------|
| Global default | `~/.pi/agent/extensions/pi-kiro-provider` (respects `PI_CODING_AGENT_DIR`) |
| Project | `.pi/extensions/pi-kiro-provider` |

Pi discovers the extension through the root `index.ts` entry listed in `package.json`.

## Configuration

Runtime configuration lives in `config.json` at the extension root. The file is user-local, gitignored, and excluded from npm package contents. A starter template is included at `config/config.example.json`.

Copy the template before customizing local settings:

```bash
cp config/config.example.json config.json
```

Minimal default-compatible configuration:

```json
{
  "enabled": true,
  "debug": false,
  "providerId": "kiro",
  "displayName": "Kiro",
  "upstreamUrl": "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse",
  "endpoint": "codewhisperer",
  "apiKey": "$KIRO_ACCESS_TOKEN",
  "requestTimeoutMs": 600000,
  "profileArn": "",
  "headers": {},
  "oauth": {
    "region": "us-east-1",
    "startUrl": "https://view.awsapps.com/start",
    "clientName": "kiro-oauth-client",
    "clientType": "public",
    "scopes": [
      "codewhisperer:completions",
      "codewhisperer:analysis",
      "codewhisperer:conversations"
    ],
    "grantTypes": [
      "urn:ietf:params:oauth:grant-type:device_code",
      "refresh_token"
    ],
    "issuerUrl": "https://identitycenter.amazonaws.com/ssoins-722374e8c3c8e6c6",
    "skipIssuerUrlForRegistration": false,
    "socialPortalUrl": "https://app.kiro.dev/signin",
    "socialPortalRedirectUri": "http://localhost:3128",
    "socialCallbackPath": "/oauth/callback",
    "socialAuthorizeUrl": "https://prod.us-east-1.auth.desktop.kiro.dev/login",
    "socialTokenUrl": "https://prod.us-east-1.auth.desktop.kiro.dev/oauth/token",
    "socialRefreshUrl": "https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken",
    "socialRedirectUri": "kiro://kiro.kiroAgent/authenticate-success",
    "methodLabels": {
      "builder-id": "AWS Builder ID",
      "google": "Google",
      "github": "GitHub"
    }
  }
}
```

### Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enables the provider extension. |
| `debug` | boolean | `false` | Enables file-only debug logging under `debug/debug.log`. |
| `providerId` | string | `kiro` | Provider ID registered with Pi. |
| `displayName` | string | `Kiro` | Human-readable provider name shown by Pi. |
| `upstreamUrl` | string | CodeWhisperer generateAssistantResponse endpoint | Streaming API endpoint. |
| `endpoint` | `codewhisperer` \| `amazonq` | inferred from `upstreamUrl` | Controls upstream request/response formatting. |
| `apiKey` | string | `$KIRO_ACCESS_TOKEN` | Environment variable reference used by provider metadata. |
| `requestTimeoutMs` | number | `600000` | Request timeout for streaming and OAuth calls. |
| `profileArn` | string | empty | Optional Kiro profile ARN sent as `x-kiro-profile-arn`. |
| `headers` | object | `{}` | Additional non-authorization headers sent upstream. |
| `oauth` | object | Kiro OAuth defaults | OAuth device/social sign-in endpoint configuration. |
| `models` | array | built-in Kiro model list | Optional replacement model list. Omit to use built-in defaults. |
| `modelDefaults` | object | built-in model defaults | Optional defaults applied to configured models. |

> Authorization headers configured in `headers`, `modelDefaults.headers`, or model-level `headers` are ignored intentionally. Kiro credentials are selected by the provider/OAuth integration.

## Validation

```bash
npm run typecheck
npm run lint
npm run test
npm run check
npm run package:dry-run
```

## Publishing

The package metadata follows the same publish-ready shape used by established Pi extensions:

- entrypoint: `index.ts`
- package exports: `.` → `./index.ts`
- Pi extension manifest: `pi.extensions`
- published files: source, README, changelog, license, and config template
- runtime `config.json`, `debug/`, test artifacts, package lock, and local metadata excluded from npm publication

Do not publish, push, or tag until the GitHub/npm release review is complete.

## License

[MIT](LICENSE)
