# Troubleshooting

- **No mappings:** choose the product root, not its `SKU-001` child, and press Rescan.
- **Validation blocks processing:** fix every red mapping row. The app refuses to spend credits on missing or ambiguous inputs.
- **OpenArt disconnected:** the shipped UI uses MockOpenArtProvider. Configure a supported MCP bridge or install the official CLI and run `openart login`; never paste an API key.
- **A batch stopped:** reopen the app and rescan the same roots. SQLite retains metadata and successful files are skipped unless overwrite is selected.
- **A result is rejected:** downloads use `.part-*`, image signature validation, then rename.
- **Windows paths:** use folder pickers. Paths with spaces and Unicode names are supported.
