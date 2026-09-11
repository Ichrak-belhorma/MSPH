# Build resources

electron-builder's `buildResources` directory (see `../electron-builder.yml`).

Add the company's real logo here before a public release:

- `icon.ico` — Windows, 256x256 (multi-resolution .ico recommended)
- `icon.icns` — macOS
- `icon.png` — Linux, 512x512

Until these exist, electron-builder falls back to its own default icon —
packaged builds work fine without them, they just won't look like MSPH's
brand yet.
