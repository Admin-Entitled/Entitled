# OpenArt setup

## OAuth and MCP

```toml
[mcp_servers.openart]
url = "https://mcp.openart.ai/mcp"
auth = "oauth"
tool_timeout_sec = 600
required = false
```

```bash
codex mcp add openart --url https://mcp.openart.ai/mcp
codex mcp login openart
```

The OAuth browser flow completed during development. Tokens remain in Codex-managed storage and are never copied into this repository, logs, SQLite, or `.env`.

## Schema boundary

The available Codex CLI can configure and authenticate the streamable HTTP server, but Electron does not receive or inherit that MCP session. The sanitized snapshot in `openart-mcp-tools.json` records that limitation. Consequently, the MCP provider deliberately fails closed until a live schema bridge is injected; it does not invent account, upload, generation, polling, or retrieval tool names.

## Production CLI

Electron uses the official CLI as its production provider:

```bash
openart version
openart login
openart account --json --no-input
openart model list --json --no-cache --no-input
```

Set `OPENART_CLI_PATH` when the executable is outside PATH. The app derives model forms and cost estimates from the live CLI. The installed CLI exposes model/image/reference/async controls, but does not expose aspect-ratio, quality, or resolution flags on `generate image`; the app therefore displays those live form capabilities and does not pretend to submit unsupported flags.

Never request or use an OpenArt API key. Do not log OAuth headers, cookies, authorization codes, or tokens.
