# Changelog

## 2.0.0
- **Node.js 22.12+ now required** (Puppeteer 25).
- Dependencies updated: puppeteer ^25, webp-converter ^3 (failed WebP conversions now reject instead of silently resolving), lottie-web ^5.13, ffmpeg-static ^5.3.
- Removed the deprecated `fluent-ffmpeg`; ffmpeg is now run directly (new `ffmpegPath` option; ffmpeg errors include ffmpeg's own message).
- WebP output is verified to exist after conversion.

## 1.0.9
- **Breaking:** `convertTgsToJson(path)` now takes an output path and returns it (previously returned `true` and wrote `sticker.json` inside the package). The low-level methods `renderJsonToImages`, `imagesToGif`, `convertGifToWebP`, `convertGifToMp4` were removed; use the `convertTo*` methods.
- Each conversion uses its own temp workspace (safe to run concurrently); always cleaned up.
- GIF output uses a generated palette (better colours, transparency kept).
- Frame rate is capped at 50fps (GIF limit) by skipping frames, so playback speed stays correct.
- MP4 is encoded directly from frames instead of via GIF.
- `lottie-web` is bundled as a dependency; no CDN needed. The `lottie_light` build is used on purpose: it has no expression engine, so a hostile `.tgs` cannot run JavaScript in the browser.
- The render page blocks all network requests; `maxFrames` (default 3000) and a 64MB decompression limit guard against hostile or huge files.
- Invalid files now fail with proper `Error`s (previously `pako` threw plain strings); `pako` dependency replaced by Node's `zlib`.
- Animation data is passed to the page safely (no HTML splicing).
- New constructor options: `puppeteerArgs`, `executablePath`, `timeout`.
- Real tests (`npm test`); LICENSE added.
