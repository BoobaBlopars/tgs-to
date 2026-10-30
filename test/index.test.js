'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TGS = require('..');

const sticker = path.join(__dirname, 'sticker.tgs');
const launchArgs = process.env.CI || process.getuid?.() === 0 ? ['--no-sandbox'] : [];

function head(file, n) {
    return fs.readFileSync(file).subarray(0, n);
}

test('constructor requires a path', () => {
    assert.throws(() => new TGS(), TypeError);
});

test('bundled lottie build has no expression engine (no eval of animation data)', () => {
    const src = fs.readFileSync(require.resolve('lottie-web/build/player/lottie_light.min.js'), 'utf8');
    assert.ok(!src.includes('bm_rt'), 'lottie_light must not contain the expression engine');
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8'), /lottie_light\.min\.js/);
});

test('non-TGS input rejects with a real Error', async () => {
    const bad = path.join(os.tmpdir(), `bad2-${process.pid}.tgs`);
    fs.writeFileSync(bad, 'hello');
    try {
        await assert.rejects(new TGS(bad).convertTgsToJson(path.join(os.tmpdir(), 'y.json')),
            (err) => err instanceof Error && /Invalid TGS/.test(err.message));
    } finally { fs.rmSync(bad, { force: true }); }
});

test('rejects animations over maxFrames before launching a browser', async () => {
    const zlib = require('zlib');
    const f = path.join(os.tmpdir(), `big-${process.pid}.tgs`);
    fs.writeFileSync(f, zlib.gzipSync(JSON.stringify({ v: '5.7.0', fr: 60, ip: 0, op: 200000, w: 512, h: 512, layers: [] })));
    try {
        await assert.rejects(new TGS(f, { puppeteerArgs: launchArgs }).convertToGif(path.join(os.tmpdir(), 'big.gif')), /over the limit/);
    } finally { fs.rmSync(f, { force: true }); }
});

test('rejects a non-TGS file', async () => {
    const bad = path.join(os.tmpdir(), `bad-${process.pid}.tgs`);
    fs.writeFileSync(bad, 'not a tgs');
    try {
        await assert.rejects(new TGS(bad).convertTgsToJson(path.join(os.tmpdir(), 'x.json')));
    } finally { fs.rmSync(bad, { force: true }); }
});

test('converts to JSON, GIF, WebP and MP4 concurrently', { timeout: 300000 }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tgs-test-'));
    try {
        const tgs = new TGS(sticker, { puppeteerArgs: launchArgs });
        const [json, gif, webpFile, mp4] = await Promise.all([
            tgs.convertTgsToJson(path.join(dir, 's.json')),
            tgs.convertToGif(path.join(dir, 's.gif')),
            tgs.convertToWebp(path.join(dir, 's.webp')),
            tgs.convertToMp4(path.join(dir, 's.mp4'))
        ]);
        assert.ok(JSON.parse(fs.readFileSync(json, 'utf8')).layers);
        assert.strictEqual(head(gif, 3).toString(), 'GIF');
        assert.strictEqual(head(webpFile, 4).toString(), 'RIFF');
        assert.strictEqual(head(mp4, 12).subarray(4, 8).toString(), 'ftyp');
        // Nothing should be left behind in the package directory.
        assert.ok(!fs.existsSync(path.join(__dirname, '..', 'frames')));
        assert.ok(!fs.existsSync(path.join(__dirname, '..', 'sticker.json')));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
