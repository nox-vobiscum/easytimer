import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('./', import.meta.url));
const files = new Map([['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
    ['/poc.css', ['poc.css', 'text/css']], ['/poc.mjs', ['poc.mjs', 'text/javascript']], ['/core.mjs', ['core.mjs', 'text/javascript']],
    ['/snapshots.mjs', ['snapshots.mjs', 'text/javascript']],
    ['/snapshot-ui.mjs', ['snapshot-ui.mjs', 'text/javascript']],
    ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json']]]);
export async function startServer(port = 8000) {
    const server = createServer(async (req, res) => {
        // Loopback-only host checks also reject DNS rebinding and cross-origin embedding.
        const expectedPort = server.address().port;
        if (![`localhost:${expectedPort}`, `127.0.0.1:${expectedPort}`].includes(req.headers.host) ||
            !['GET', 'HEAD'].includes(req.method)) { res.writeHead(403); res.end(); return; }
        const entry = files.get(req.url);
        if (!entry) { res.writeHead(404); res.end(); return; }
        try {
            const body = await readFile(resolve(root, entry[0]));
            res.writeHead(200, { 'Content-Type': `${entry[1]}; charset=utf-8`, 'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer-when-downgrade',
                'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
                'Content-Security-Policy': "default-src 'none'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self'; connect-src https://www.googleapis.com https://accounts.google.com; frame-src https://accounts.google.com; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" });
            res.end(req.method === 'HEAD' ? undefined : body);
        } catch { res.writeHead(500); res.end(); }
    });
    await new Promise((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done); });
    return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const server = await startServer();
    console.log(`Isolated PoC only: http://localhost:${server.address().port}/ (no production routes, no access logging)`);
}
