import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = "127.0.0.1";
const routes = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/spike.css", ["spike.css", "text/css; charset=utf-8"]],
  ["/spike.mjs", ["spike.mjs", "text/javascript; charset=utf-8"]],
  ["/overtype-adapter.mjs", ["overtype-adapter.mjs", "text/javascript; charset=utf-8"]],
  ["/preview-policy.mjs", ["preview-policy.mjs", "text/javascript; charset=utf-8"]],
  ["/vendor/overtype.min.js", ["vendor/overtype.min.js", "text/javascript; charset=utf-8"]]
]);

export function createSpikeServer() {
  return http.createServer(async (request, response) => {
    const pathname = new URL(request.url, `http://${HOST}`).pathname;
    const route = routes.get(pathname);
    const headers = {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY"
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { ...headers, Allow: "GET, HEAD" });
      response.end("Method Not Allowed");
      return;
    }
    if (!route) {
      response.writeHead(404, headers);
      response.end("Not Found");
      return;
    }
    try {
      const body = await readFile(path.join(ROOT, route[0]));
      response.writeHead(200, { ...headers, "Content-Type": route[1] });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(500, headers);
      response.end("Internal Server Error");
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const requestedPort = Number.parseInt(process.env.EASYTIMER_NOTES_SPIKE_PORT ?? "4178", 10);
  const server = createSpikeServer();
  server.listen(requestedPort, HOST, () => {
    const address = server.address();
    console.log(`easyTimer Notes Editor spike: http://${HOST}:${address.port}/`);
  });
}
