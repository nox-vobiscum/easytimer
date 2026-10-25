import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
const allowed = new Map([
    ['/', 'tools/local-store-poc/index.html'],
    ...['adapter.mjs', 'ui.mjs', 'experiments.mjs'].map(file => [`/tools/local-store-poc/${file}`, `tools/local-store-poc/${file}`]),
    ['/src/js/templates.mjs', 'src/js/templates.mjs'], // Pure existing validation only; no application initialization.
]);
export async function startServer(port = 8011) {
    const server = createServer(async (req, res) => {
        if (![`localhost:${server.address().port}`, `127.0.0.1:${server.address().port}`].includes(req.headers.host) || req.method !== 'GET') { res.writeHead(403); res.end(); return; }
        const file = allowed.get(req.url);
        if (!file) { res.writeHead(404); res.end(); return; }
        try {
            res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
                'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
                'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
            res.end(await readFile(resolve(root, file)));
        } catch { res.end(); }
    });
    await new Promise((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done); });
    return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    await startServer(); console.log('Local transactions only: http://localhost:8011/');
}
