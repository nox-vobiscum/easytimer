import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const browser = process.env.EASYTIMER_BROWSER
    || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const origin = process.env.EASYTIMER_GRID_ORIGIN || 'http://127.0.0.1:4185';
const results = [];
for (const theme of ['light', 'dark']) for (const width of [320, 375, 390, 430, 1280]) {
    const profile = join(tmpdir(), `easytimer-grid-${width}-${crypto.randomUUID()}`);
    const run = spawnSync(browser, [
        '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
        `--user-data-dir=${profile}`, '--window-size=1280,800', '--virtual-time-budget=2500',
        '--dump-dom', `${origin}/tests/fixtures/native-phase-grid.html?width=${width}&theme=${theme}`,
    ], { encoding: 'utf8', timeout: 15_000, windowsHide: true });
    assert.equal(run.status, 0, run.stderr || `Chromium failed at ${width}px`);
    const match = run.stdout.match(/<pre id="result">(.*?)<\/pre>/s);
    assert.ok(match, `Chromium returned no computed result at ${width}px`);
    const result = JSON.parse(match[1].replaceAll('&quot;', '"'));
    assert.equal(result.controls, 6); assert.equal(result.ordered, true);
    assert.equal(result.theme, theme);
    assert.equal(result.enabled, true); assert.equal(result.detailsOpen, true);
    assert.equal(result.positionOpen, true); assert.equal(result.horizontalOverflow, false);
    assert.equal(result.feedbackOpaque, true); assert.equal(result.feedbackAccent, true);
    assert.equal(result.placeholderEmpty, true); assert.equal(result.cleanupRestored, true);
    assert.equal(result.columns, width <= 400 ? 5 : 6, `Unexpected computed grid at ${width}px`);
    results.push(result);
}
console.log(JSON.stringify(results, null, 2));
