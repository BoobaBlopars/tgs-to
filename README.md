# @boobablopars/tgs-to

Convert Telegram animated stickers (`.tgs`) to GIF, WebP, MP4, or JSON.

## Install

```bash
npm install @boobablopars/tgs-to
```

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

Every `convert*` method resolves with the absolute output path.

### Options

```js
new TGS('./sticker.tgs', {
  puppeteerArgs: ['--no-sandbox'], // needed when running as root, e.g. Docker/CI
  executablePath: '/usr/bin/chromium', // optional custom Chrome/Chromium
  timeout: 30000,                      // ms for loading the animation and each page operation
  maxFrames: 3000                      // refuse animations that would render more output frames
});
```

## Security

`.tgs` files from untrusted users are safe to convert by design:

- Rendering uses `lottie_light`, which has no expression engine, so JavaScript embedded in an animation is never executed.
- The headless browser blocks all network requests during rendering.
- Decompressed size is capped at 64MB and frame count at `maxFrames`.

You should still run Chromium sandboxed where possible. Only pass `--no-sandbox` (e.g. in Docker) if the container itself is isolated.

## Errors

Invalid input rejects with an `Error` whose message starts with `Invalid TGS file`. Animations over `maxFrames` reject before any browser is launched.

## Notes

- Node.js 22.12+ required (Puppeteer 25). Run tests with `npm test` (needs a working Chromium).
- `lottie-web` is bundled; rendering works offline (no CDN).
- Each conversion uses its own temporary workspace, so conversions can run concurrently. Temp files are removed afterwards.
- GIF/WebP are capped at 50fps (GIF timing limit); 60fps stickers are down-sampled so speed stays correct.
- MP4 has no alpha channel, so transparent areas render black.
- Puppeteer needs a compatible Chrome/Chromium; on Linux extra system libraries may be required.
- Upgrading from `tgs-to` 1.0.x: see [CHANGELOG](CHANGELOG.md) for API changes.
- This is a maintained fork of [`tgs-to`](https://github.com/VIGNESHSHYAM/tgs-to) by vignesh-a (also on [npm](https://www.npmjs.com/package/tgs-to)). It is not the official release and is not affiliated with or endorsed by the original author. Licensed under ISC; see LICENSE for both copyright lines.

## License

ISC
