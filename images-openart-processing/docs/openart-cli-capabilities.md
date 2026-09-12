# OpenArt CLI capabilities

Captured from the official OpenArt CLI on 2026-09-09.

| Capability | Confirmed command                                                            | Result                                                                  |
| ---------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Version    | `openart version`                                                            | `0.1.1`, commit `85fa0ad`, Linux amd64                                  |
| Account    | `openart account --json --no-input`                                          | Returns `user`, `plan`, and `credits`                                   |
| Models     | `openart model list --json --no-cache --no-input`                            | Returns model `id`, `displayName`, `description`, and media modes       |
| Form       | `openart model form <model> <mode> --json --no-input`                        | Returns JSON Schema under `jsonSchema`                                  |
| Cost       | `openart model cost --json --model <id> --mode <mode> --no-input`            | Returns `items[].config`, `unitCredits`, `quantity`, and `totalCredits` |
| Upload     | `openart upload add <file> --json --no-input`                                | Returns `status`, `uploadId`, and `url`                                 |
| Generate   | `openart generate image <prompt> --model <id> --image <file> --async --json` | Asynchronous submission; local images are uploaded automatically        |
| Status     | `openart creation get <id> --json --no-input`                                | Returns status and result URLs after completion                         |
| Wait       | `openart creation wait <id> --json --timeout 5m --no-input`                  | Polls until terminal state                                              |

`--dry-run` prints the request body and endpoint and makes no API generation call. The representative GPT Image 2 image-to-image dry-run succeeded with one local reference and returned `POST /api/cli/v1/generate`.

The installed CLI accepts global `--json`, `--async`, `--dry-run`, `--no-input`, `--timeout`, `--project`, and `--workspace` flags. The application invokes the executable with an argument array, never a shell command string. Although the GPT Image 2 form describes `imageCount` 1–8, `generate image --help` exposes no image-count flag, so the production CLI adapter rejects output counts other than one rather than silently dropping the setting.

The authenticated inspection returned a Plus account with a credit balance. Credentials, email, upload URLs, tokens, cookies, and authorization headers are intentionally not stored in this repository.

## GPT Image 2

The live model ID is `gpt-image-2`. Both `text2image` and `image2image` are available. The image-to-image form requires `prompt` and `visualReferences`; its schema allows up to 16 references, 1–8 outputs, aspect ratios including `1:1`, resolution tiers `1k`, `2k`, and `4k`, quality `low`, `medium`, `high`, or `auto`, and output formats `png`, `jpeg`, and `webp`.

The observed default image-to-image price was 42 credits for `{ aspectRatio: "4:3", imageCount: 1, quality: "medium", resolutionTier: "2k" }`. Cost is configuration-dependent; the app displays the CLI response and labels it as an estimate.
