import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const files = new Set([
    ...['index.html', 'style.css', 'ui.mjs', 'store.mjs', 'transport.mjs', 'coordinator.mjs', 'experiments.mjs', 'fake-drive.mjs'].map(f => 'tools/sync-integration/' + f),
    'tools/local-store-poc/adapter.mjs', 'src/js/templates.mjs', 'tools/sync-poc/core.mjs', 'tools/sync-poc/snapshots.mjs',
    ...['canonical.mjs', 'graph.mjs', 'reconcile.mjs'].map(f => 'tools/sync-core/' + f),
]);
export async function startServer(port = 8000) {
    const server = createServer(async (req, res) => {
        if (![`localhost:${server.address().port}`, `127.0.0.1:${server.address().port}`].includes(req.headers.host) || req.method !== 'GET') { res.writeHead(403); res.end(); return; }
        const path = req.url === '/' ? 'tools/sync-integration/index.html' : req.url.slice(1);
        if (!files.has(path)) { res.writeHead(404); res.end(); return; }
        try {
            const body = await readFile(resolve(root, path));
            res.writeHead(200, { 'Content-Type': (path.endsWith('.html') ? 'text/html' : path.endsWith('.css') ? 'text/css' : 'text/javascript') + '; charset=utf-8',
                'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer-when-downgrade',
                'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
                'Content-Security-Policy': "default-src 'none'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self'; connect-src https://www.googleapis.com https://accounts.google.com; frame-src https://accounts.google.com; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
            res.end(body);
        } catch { res.writeHead(500); res.end(); }
    });
    await new Promise((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done); }); return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    await startServer(); console.log('Synthetic integration only: http://localhost:8000/');
}
