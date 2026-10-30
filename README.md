# @boobablopars/tgs-to

Convert Telegram animated stickers (`.tgs`) to GIF, WebP, MP4, or JSON.

> Maintained fork of [`tgs-to`](https://github.com/VIGNESHSHYAM/tgs-to) by vignesh-a. See [Credits](#credits).

## Install

```bash
npm install @boobablopars/tgs-to
```

Requires Node.js 22.12 or newer.

## Usage

```js
const TGS = require('@boobablopars/tgs-to');

const tgs = new TGS('./sticker.tgs');

async function main() {
  await tgs.convertToGif('./sticker.gif');
  await tgs.convertToWebp('./sticker.webp');
  await tgs.convertToMp4('./sticker.mp4');
  await tgs.convertTgsToJson('./sticker.json');
}

main().catch(console.error);
```

Conversions can run in parallel (`Promise.all`); each uses its own temporary workspace.

## API

### `new TGS(tgsFilePath, [options])`

| Option | Default | Description |
|---|---|---|
| `puppeteerArgs` | `[]` | Extra Chromium arguments, e.g. `['--no-sandbox']` when running as root (Docker/CI). |
| `executablePath` | Puppeteer's Chromium | Path to a custom Chrome/Chromium binary. |
| `ffmpegPath` | `ffmpeg-static` | Path to a custom ffmpeg binary. |
| `fps` | `50` | Maximum output frame rate (1–50). Lower values give smaller files and much faster conversion, e.g. `20` for chat stickers. |
| `size` | `512` | Output width and height in pixels (16–1024, rounded to an even number). |
| `timeout` | `30000` | Milliseconds allowed for loading the animation and for each page operation. |
| `maxFrames` | `3000` | Refuse animations that would render more output frames than this. |

### Methods

All methods return a promise that resolves with the absolute output path. Missing output folders are created.

| Method | Output |
|---|---|
| `convertToGif(path)` | Animated GIF, transparency kept. |
| `convertToWebp(path)` | Animated WebP (made from the GIF). |
| `convertToMp4(path)` | H.264 MP4. MP4 has no alpha channel, so transparent areas render black. |
| `convertTgsToJson(path)` | The decompressed Lottie JSON. If `path` is omitted, it is written next to the current working directory as `<name>.json`. |

### Errors

Every failure rejects with an `Error`. Bad input messages start with `Invalid TGS file`. Animations over `maxFrames` reject before any browser is launched. ffmpeg failures include ffmpeg's own message.

## Behaviour notes

- Output is capped at 50fps (the GIF timing limit), or your `fps` option if lower; 60fps stickers are down-sampled so playback speed stays correct.
- Speed: conversion time grows with the number of frames. A 3-second 60fps sticker takes about 9 seconds at `{ fps: 20, size: 400 }` versus about 25 seconds at the defaults (measured on a 2-core machine).
- In containers (Docker, Pterodactyl) Chromium usually needs `puppeteerArgs: ['--no-sandbox', '--disable-dev-shm-usage']`.
- `lottie-web` is bundled, so rendering works offline.
- Puppeteer needs a compatible Chrome/Chromium; on Linux extra system libraries may be required.
- Run the tests with `npm test` (needs a working Chromium).

## Security

This package is hardened for converting `.tgs` files from untrusted sources, but no browser-based converter is risk-free, so isolate it as you would any service that processes user uploads.

- Rendering uses lottie-web's `lottie_light` build, which has no expression engine, so JavaScript embedded in an animation is not executed.
- The headless browser blocks all network requests while rendering.
- Decompressed size is capped at 64MB and frame count at `maxFrames`.
- Only pass `--no-sandbox` if the container itself is isolated.

## Changes from the original

Migrating from `tgs-to` 1.0.x? Install this package under its new name and read the [CHANGELOG](CHANGELOG.md): `convertTgsToJson` now takes an output path, the low-level helper methods were removed, and Node 22.12+ is required.

## Credits

This is a maintained fork of [`tgs-to`](https://github.com/VIGNESHSHYAM/tgs-to) by vignesh-a (also on [npm](https://www.npmjs.com/package/tgs-to)). It is not the official release and is not affiliated with or endorsed by the original author.

## License

ISC. See [LICENSE](LICENSE) for both copyright lines.
