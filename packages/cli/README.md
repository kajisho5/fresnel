# fresnel-icon

Command-line tools from [fresnel](https://github.com/kajisho5/fresnel) for **Liquid Glass app icons** (`.icon` bundles, Apple's Icon Composer format).

```bash
npx fresnel-icon build spec.json -o MyApp.icon
npx fresnel-icon inspect MyApp.icon
npx fresnel-icon validate MyApp.icon [--json] [--strict]
npx fresnel-icon render MyApp.icon [-a dark] [-s 512] [--sheet] [-o out.png]
npx fresnel-icon export MyApp.icon -o dist [--formats icon,icns,appiconset,png] [--sizes 1024,512] [--appearances default,dark]
npx fresnel-icon mcp [--root dir]
```

Every MCP tool also runs from the command line with the same arguments (`_` becomes `-`) and prints JSON. These lines are generated from the SPEC registry:

<!-- spec:cli -->
```bash
npx fresnel-icon create <path> [--background <string>] [--dark-background <string>] [--watch] [--overwrite] [--dry-run]
npx fresnel-icon call icon_inspect <path>
npx fresnel-icon add-group <path> --name <string> [--index <n>] [--props '<json>'] [--dry-run]
npx fresnel-icon add-layer <path> --group <string> [--svg <string>] [--source <string>] [--png-base64 <string>] [--file-name <string>] [--name <string>] [--index <n>] [--props '<json>'] [--dry-run]
npx fresnel-icon set <path> --target <string> --props '<json>' [--appearance dark|tinted] [--platform iOS|macOS|watchOS|square] [--dry-run]
npx fresnel-icon move <path> --target <string> --index <n> [--to-group <string>] [--dry-run]
npx fresnel-icon align <path> --targets <string>,… --how left|hcenter|right|top|vcenter|bottom|distribute-horizontal|distribute-vertical [--basis selection|canvas] [--platform iOS|macOS|watchOS|square] [--dry-run]
npx fresnel-icon remove <path> --target <string> [--dry-run]
npx fresnel-icon call icon_validate <path>
npx fresnel-icon call icon_render <path> [--appearance default|dark|clear-light|clear-dark|tinted-light|tinted-dark] [--platform iOS|macOS|watchOS] [--size <n>] [--mask squircle|circle|none] [--tint <string>] [--light-angle <n>] [--out <string>]
npx fresnel-icon render-sheet <path> [--cell <n>] [--tint <string>] [--out <string>]
npx fresnel-icon call icon_export <path> --out-dir <string> --formats icon|icns|appiconset|png,… [--sizes <n>,…] [--appearances default|dark|clear-light|clear-dark|tinted-light|tinted-dark,…]
npx fresnel-icon contract --json
```
<!-- /spec:cli -->

`fresnel <command> --help` shows each argument and runnable examples. `--args '<json>'` passes all arguments at once.

- `validate` exits with code 1 on errors. With `--strict` it also exits 1 on warnings, so you can use it in CI.
- Raster output uses fresnel's approximate renderer.

MIT licensed. Not affiliated with Apple Inc.
