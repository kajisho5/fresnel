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

- `validate` exits with code 1 on errors. With `--strict` it also exits 1 on warnings, so you can use it in CI.
- Raster output uses fresnel's approximate renderer.

MIT licensed. Not affiliated with Apple Inc.
