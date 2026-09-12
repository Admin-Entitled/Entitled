# Images OpenArt Processing

`images-openart-processing` is a local Electron desktop application for validating, previewing, and processing product image batches through OpenArt. It keeps image binaries on disk, stores only job metadata in SQLite, and resumes work after restarts.

## Install

```bash
cd images-openart-processing
npm install
```

## Run and verify

```bash
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
npm run package
npm run test:e2e:packaged
```

## OpenArt MCP OAuth

Codex CLI `0.149.1` was used to configure the server and OAuth login:

```bash
codex --version
codex mcp --help
codex mcp add openart --url https://mcp.openart.ai/mcp
codex mcp login openart
```

The login opens the OpenArt OAuth browser flow for Codex only. No API key is used or stored by this project. Electron uses the separately authenticated official OpenArt CLI; Codex MCP OAuth is not inherited by Electron. The MCP adapter remains experimental and fails closed unless a live schema bridge is explicitly bound.

## Official CLI fallback

```bash
openart --version
openart login
```

If it is missing on Linux/macOS, install it with `curl -fsSL https://raw.githubusercontent.com/OpenArt-AI/cli/main/install.sh | sh`. On Windows use `irm https://raw.githubusercontent.com/OpenArt-AI/cli/main/install.ps1 | iex`. Then run `openart login`. The app checks for the executable and does not download an unverified binary at runtime. Set `OPENART_CLI_PATH` when the executable is not on PATH.

## Normal catalogue workflow

Launch the app. Choose the product input root and a writable durable results directory. The bundled `ENTITLED Catalogue v1` preset is loaded automatically; Prompt 01 is selected by default. Select any additional ready numbered outputs, click `Scan Products`, review the role-aware product rows, click `Validate Batch`, then use the simple confirmation modal before `Generate Selected`. Validation is local-only: it does not upload or create OpenArt work. The selected output directory is remembered for the next launch. Prompts and configured presentation references are read-only application resources; normal use never asks for `.txt` prompt or presentation-reference browsing. Real processing is blocked without a durable directory, and completed job history is rehydrated from SQLite after restart. OpenArt CLI 0.1.1 does not provide a pre-generation cost estimate; generation does not depend on one.

Prompt cards without a configured presentation reference remain disabled. Prompt 10 is a special size-chart dependency workflow and remains disabled until its approved Prompt 01 output, measurement image, and official ENTITLED logo asset are configured.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/FOLDER_FORMAT.md](docs/FOLDER_FORMAT.md), [docs/OPENART_SETUP.md](docs/OPENART_SETUP.md), and [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).
