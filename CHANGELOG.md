# Changelog

## 2.1.0
- New options `fps` (cap the frame rate) and `size` (output pixel size). Lower values make conversion much faster and files much smaller.
- WebP encoding now uses a faster encoder setting (`-m 2 -mt`): about 6x faster than before with a nearly identical file size.
- Verified end to end with a real `gif2webp` build and with a Discord/WhatsApp-style bot that calls `new TGS(path).convertToWebp(out)`.

## 2.0.0

First release of this fork. Changes relative to upstream `tgs-to` 1.0.6:

### Breaking
- **Node.js 22.12+ required** (Puppeteer 25).
- `convertTgsToJson(path)` now takes an output path and returns it (it used to return `true` and write `sticker.json` inside the package folder).
- Removed the low-level methods `renderJsonToImages`, `imagesToGif`, `convertGifToWebP` and `convertGifToMp4`; use the `convertTo*` methods.
- Every `convert*` method resolves with the absolute output path.

### Fixed
- Conversions no longer share files in the package folder, so running them in parallel is safe. Each uses a private temp workspace that is always cleaned up (including on failure), and the process `exit` listener leak is gone.
- Chromium is always closed, even when rendering fails.
- Playback speed: the real frame rate is used, capped at 50fps by down-sampling.
- Frame range: animations with a non-zero start frame are handled.
- WebP: failed conversions reject (webp-converter 3) and the output file is checked.
- Invalid files fail with proper `Error`s (previously `pako` threw plain strings).

### Security
- Uses lottie-web's `lottie_light` build, which has no expression engine, so a hostile `.tgs` cannot run JavaScript in the browser (the full build can).
- The render page blocks all network requests.
- 64MB decompression limit and `maxFrames` (default 3000) guard against huge or hostile files.
- Animation data is passed to the page as data, not spliced into HTML.

### Improved
- GIF output uses a generated palette (better colours, transparency kept); MP4 is encoded straight from the frames (`yuv420p`, `faststart`).
- `lottie-web` is bundled; no CDN needed.
- New options: `puppeteerArgs`, `executablePath`, `ffmpegPath`, `timeout`, `maxFrames`.

### Dependencies
- puppeteer ^25, webp-converter ^3, lottie-web ^5.13, ffmpeg-static ^5.3.
- Removed `fluent-ffmpeg` (deprecated; ffmpeg is now run directly) and `pako` (replaced by Node's `zlib`).

### Project
- Real tests (`npm test`), a LICENSE file keeping the original copyright, and a flattened repo layout (no `package/` subfolder).
