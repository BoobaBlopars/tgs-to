'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');
const zlib = require('zlib');
const webp = require('webp-converter');
const { spawn } = require('child_process');
const ffmpegStaticPath = require('ffmpeg-static');

const DEFAULT_SIZE = 512;
const MAX_INFLATED_BYTES = 64 * 1024 * 1024; // guard against decompression bombs
const DEFAULT_MAX_FRAMES = 3000; // output frames (60s at 50fps)
const MAX_FPS = 50; // GIF delays are stored in 1/100 s, so >50fps cannot play at the right speed.

// SECURITY: use the "light" build. Full/canvas builds ship an expression engine that eval()s
// JavaScript embedded in the animation file, i.e. a hostile .tgs could run code in Chromium.
// lottie_light has no expression support (Telegram stickers must not use expressions anyway).
let lottieSource;
function getLottieSource() {
    if (!lottieSource) {
        lottieSource = fs.readFileSync(require.resolve('lottie-web/build/player/lottie_light.min.js'), 'utf8');
    }
    return lottieSource;
}

function checkNumber(name, value, fallback, min, max) {
    if (value === undefined || value === null) return fallback;
    if (!Number.isFinite(value) || value < min || value > max) {
        throw new RangeError(`Option "${name}" must be a number between ${min} and ${max}.`);
    }
    return value;
}

class TGS {
    /**
     * @param {string} tgsFilePath Path to a .tgs file.
     * @param {object} [options]
     * @param {string[]} [options.puppeteerArgs] Extra Chromium args, e.g. ['--no-sandbox'] in Docker/CI.
     * @param {string} [options.executablePath] Custom Chrome/Chromium binary.
     * @param {number} [options.timeout=30000] Timeout (ms) for loading the animation and for each page operation.
     * @param {number} [options.fps=50] Maximum output frame rate (1-50). Lower = smaller files and faster conversion.
     * @param {number} [options.size=512] Output width/height in pixels (16-1024).
     * @param {string} [options.ffmpegPath] Use this ffmpeg binary instead of the bundled ffmpeg-static one.
     * @param {number} [options.maxFrames=3000] Refuse animations that would render more output frames than this.
     */
    constructor(tgsFilePath, options = {}) {
        if (!tgsFilePath) throw new TypeError('A TGS file path is required.');
        this.tgsFilePath = path.resolve(tgsFilePath);
        this.options = {
            puppeteerArgs: options.puppeteerArgs || [],
            executablePath: options.executablePath,
            ffmpegPath: options.ffmpegPath || ffmpegStaticPath,
            fps: checkNumber('fps', options.fps, MAX_FPS, 1, MAX_FPS),
            size: Math.round(checkNumber('size', options.size, DEFAULT_SIZE, 16, 1024) / 2) * 2, // even: required by yuv420p MP4
            timeout: options.timeout || 30000,
            maxFrames: options.maxFrames || DEFAULT_MAX_FRAMES
        };
    }

    _makeWorkspace() {
        return fs.mkdtempSync(path.join(os.tmpdir(), 'tgs-to-'));
    }

    _readAnimationData() {
        const compressed = fs.readFileSync(this.tgsFilePath);
        let json;
        try {
            json = zlib.unzipSync(compressed, { maxOutputLength: MAX_INFLATED_BYTES }).toString('utf8');
        } catch (err) {
            throw new Error(`Invalid TGS file: could not decompress (${err.message}).`);
        }
        let data;
        try {
            data = JSON.parse(json);
        } catch (err) {
            throw new Error(`Invalid TGS file: animation is not valid JSON (${err.message}).`);
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw new Error('Invalid TGS file: animation data must be a JSON object.');
        }
        if (!Number.isFinite(data.ip) || !Number.isFinite(data.op) ||
            !Number.isFinite(data.fr) || data.op <= data.ip || data.fr <= 0) {
            throw new Error('Invalid TGS file: missing or invalid frame range or frame rate.');
        }
        return data;
    }

    /** Renders frames to PNG files and returns the output frame rate. */
    async _renderFrames(animationData, framesDir) {
        fs.mkdirSync(framesDir, { recursive: true });

        const totalSourceFrames = animationData.op - animationData.ip;
        const outFps = Math.min(animationData.fr, this.options.fps);
        const outFrameCount = Math.max(1, Math.round((totalSourceFrames / animationData.fr) * outFps));
        const step = animationData.fr / outFps; // source frames per output frame (1 when fr <= MAX_FPS)
        if (outFrameCount > this.options.maxFrames) {
            throw new Error(`Animation has ${outFrameCount} frames, over the limit of ${this.options.maxFrames} (see the maxFrames option).`);
        }

        const SIZE = this.options.size;
        let browser;
        try {
            const launchOptions = { headless: true, args: this.options.puppeteerArgs };
            if (this.options.executablePath) launchOptions.executablePath = this.options.executablePath;
            browser = await puppeteer.launch(launchOptions);
            const page = await browser.newPage();
            page.setDefaultTimeout(this.options.timeout);
            // The page never needs the network: block everything except inline content.
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const url = req.url();
                if (url.startsWith('data:') || url.startsWith('about:') || url.startsWith('blob:')) req.continue();
                else req.abort();
            });
            await page.setViewport({ width: SIZE, height: SIZE, deviceScaleFactor: 1 });

            await page.setContent(
                `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;width:${SIZE}px;height:${SIZE}px;overflow:hidden;background:transparent}
#lottie{width:${SIZE}px;height:${SIZE}px}</style></head>
<body><div id="lottie"></div></body></html>`,
                { waitUntil: 'load' }
            );

            // Lottie is bundled (no CDN) and the animation data is passed as a value,
            // not spliced into HTML, so odd content such as "</script>" cannot break the page.
            await page.addScriptTag({ content: getLottieSource() });
            await page.evaluate((data) => new Promise((resolve, reject) => {
                if (!window.lottie) { reject(new Error('Could not load lottie-web')); return; }
                const animation = window.lottie.loadAnimation({
                    container: document.getElementById('lottie'),
                    renderer: 'svg',
                    loop: false,
                    autoplay: false,
                    animationData: data
                });
                window.animation = animation;
                animation.addEventListener('DOMLoaded', () => resolve(true));
                animation.addEventListener('data_failed', () => reject(new Error('Lottie could not load animation data')));
            }), animationData);
            await page.waitForFunction(
                () => window.animation && window.animation.isLoaded,
                { timeout: this.options.timeout }
            );

            for (let i = 0; i < outFrameCount; i++) {
                const sourceFrame = Math.min(
                    Math.floor(animationData.ip + i * step),
                    Math.ceil(animationData.op) - 1
                );
                await page.evaluate((frameNumber) => {
                    window.animation.goToAndStop(frameNumber, true);
                }, sourceFrame);
                // Let the renderer paint the requested frame before capturing.
                await page.evaluate(() => new Promise(resolve =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve))));
                await page.screenshot({
                    path: path.join(framesDir, `frame_${i}.png`),
                    omitBackground: true
                });
            }
        } finally {
            if (browser) await browser.close();
        }
        return outFps;
    }

    _runFfmpeg(inputPattern, frameRate, outputPath, outputOptions) {
        const bin = this.options.ffmpegPath;
        if (!bin) {
            return Promise.reject(new Error('No ffmpeg binary available (ffmpeg-static found none); pass the ffmpegPath option.'));
        }
        const args = ['-y', '-v', 'error', '-framerate', String(frameRate), '-i', inputPattern, ...outputOptions, outputPath];
        return new Promise((resolve, reject) => {
            const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
            let stderr = '';
            child.stderr.on('data', (chunk) => { if (stderr.length < 8192) stderr += chunk; });
            child.on('error', (err) => reject(new Error(`Could not run ffmpeg: ${err.message}`)));
            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
            });
        });
    }

    async _framesToGif(framesDir, fps, gifPath) {
        const SIZE = this.options.size;
        // Two-pass palette keeps colours clean and preserves transparency.
        const filter = `scale=${SIZE}:-1:flags=lanczos,split[a][b];` +
            `[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=alpha_threshold=128`;
        await this._runFfmpeg(path.join(framesDir, 'frame_%d.png'), fps, gifPath, [
            '-vf', filter,
            '-loop', '0'
        ]);
    }

    async _renderToWorkspace(workspace) {
        const animationData = this._readAnimationData();
        const framesDir = path.join(workspace, 'frames');
        const fps = await this._renderFrames(animationData, framesDir);
        return { framesDir, fps };
    }

    async _withWorkspace(outputPath, work) {
        const workspace = this._makeWorkspace();
        try {
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
            await work(workspace);
            return outputPath;
        } finally {
            fs.rmSync(workspace, { recursive: true, force: true });
        }
    }

    async convertToGif(gifFilePath) {
        const outputPath = path.resolve(gifFilePath);
        return this._withWorkspace(outputPath, async (workspace) => {
            const { framesDir, fps } = await this._renderToWorkspace(workspace);
            await this._framesToGif(framesDir, fps, outputPath);
        });
    }

    async convertToWebp(webpFilePath) {
        const outputPath = path.resolve(webpFilePath);
        return this._withWorkspace(outputPath, async (workspace) => {
            const { framesDir, fps } = await this._renderToWorkspace(workspace);
            const gifPath = path.join(workspace, 'sticker.gif');
            await this._framesToGif(framesDir, fps, gifPath);
            if (typeof webp.grant_permission === 'function') {
                try { await webp.grant_permission(); } catch (_) { /* binaries may already be executable */ }
            }
            // -m 2 is ~6x faster than the default method with almost identical size.
            await webp.gwebp(gifPath, outputPath, '-q 80 -m 2 -mt');
            if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
                throw new Error('WebP conversion failed: no output was produced.');
            }
        });
    }

    async convertToMp4(mp4FilePath) {
        const outputPath = path.resolve(mp4FilePath);
        return this._withWorkspace(outputPath, async (workspace) => {
            // Encode straight from the PNG frames (no lossy GIF in between).
            const { framesDir, fps } = await this._renderToWorkspace(workspace);
            const SIZE = this.options.size;
            await this._runFfmpeg(path.join(framesDir, 'frame_%d.png'), fps, outputPath, [
                '-vf', `scale=${SIZE}:-1:flags=lanczos,format=yuv420p`,
                '-movflags', '+faststart'
            ]);
        });
    }

    async convertTgsToJson(jsonFilePath) {
        const outputPath = path.resolve(jsonFilePath ||
            path.basename(this.tgsFilePath, path.extname(this.tgsFilePath)) + '.json');
        const data = this._readAnimationData();
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
        return outputPath;
    }
}

module.exports = TGS;
