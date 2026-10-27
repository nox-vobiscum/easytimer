import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const development = new Set([
    ...['entry.mjs', 'controller.mjs', 'panel.mjs', 'storage.mjs', 'drive.mjs', 'experiments.mjs', 'conflict-panel.mjs', 'conflict-experiments.mjs', 'diagnostics.mjs', 'diagnostic-experiments.mjs'].map(f => 'tools/app-sync/' + f),
    'tools/local-store-poc/adapter.mjs', 'tools/sync-poc/core.mjs', 'tools/sync-poc/snapshots.mjs', 'tools/sync-integration/store.mjs',
    'tools/sync-integration/fake-drive.mjs',
    ...['canonical.mjs', 'graph.mjs', 'reconcile.mjs'].map(f => 'tools/sync-core/' + f),
]);
export async function startServer({ port = 8000, enabled = false } = {}) {
    const server = createServer(async (req, res) => {
        if (![`localhost:${server.address().port}`, `127.0.0.1:${server.address().port}`].includes(req.headers.host) || req.method !== 'GET') { res.writeHead(403); res.end(); return; }
        const path = new URL(req.url, 'http://localhost').pathname;
        const relative = path.startsWith('/tools/') ? path.slice(1) : path.startsWith('/src/') ? path.slice(1) : 'src' + (path === '/' ? '/index.html' : path);
        if ((relative.startsWith('tools/') && (!enabled || !development.has(relative))) || !/^(src\/(?:index\.html|service-worker\.js|manifest\.webmanifest|js\/[a-z-]+\.(?:js|mjs)|css\/styles\.css|assets\/branding\/[a-zA-Z0-9_.-]+)|tools\/)/.test(relative) || relative.includes('..') || (enabled && relative === 'src/service-worker.js')) { res.writeHead(404); res.end(); return; }
        try {
            let body = await readFile(resolve(root, relative));
            if (enabled && relative === 'src/index.html') body = body.toString().replace('js/app.js?v=43', '/tools/app-sync/entry.mjs');
            const type = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' }[extname(relative)];
            res.writeHead(200, { 'Content-Type': type || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
                'Cross-Origin-Opener-Policy': 'same-origin-allow-popups', 'Referrer-Policy': 'no-referrer-when-downgrade' }); res.end(body);
        } catch { res.writeHead(404); res.end(); }
    });
    await new Promise((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done); }); return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const enabled = process.argv.includes('--enable-drive'); await startServer({ enabled });
    console.log(enabled ? 'Development-only Drive integration: http://localhost:8000/' : 'Normal local application; Google integration disabled: http://localhost:8000/');
}
