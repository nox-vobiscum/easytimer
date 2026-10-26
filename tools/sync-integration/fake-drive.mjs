// Deterministic HTTP test double. No tokens, account names or request headers are recorded.
export function fakeDrive() {
    const files = new Map(), calls = [];
    let next = 0;
    const api = { files, calls, fault: null, pageSize: 1, duplicatePage: false, incomplete: false, omit: null,
        fetch: async (url, init) => {
            const parsed = new URL(url), path = parsed.pathname;
            calls.push({ method: init.method, path });
            const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
            if (path.endsWith('/about')) return json({ user: { permissionId: 'synthetic-account-A' } });
            if (api.fault) { const response = await api.fault({ url: parsed, init, files }); if (response) return response; }
            if (path.endsWith('/generateIds')) return json({ ids: ['synthetic-file-' + (++next)] });
            if (path.startsWith('/upload/')) {
                const parts = init.body.split('\r\n\r\n');
                const metadata = JSON.parse(parts[1].split('\r\n--')[0]), bytes = parts[2].split('\r\n--')[0];
                if (files.has(metadata.id)) return json({}, 409);
                files.set(metadata.id, { meta: { ...metadata, spaces: ['appDataFolder'] }, bytes }); return json({ id: metadata.id });
            }
            if (path === '/drive/v3/files') {
                const start = Number(parsed.searchParams.get('pageToken') || 0);
                const all = [...files.values()].map(f => f.meta).filter(f => f.id !== api.omit);
                const page = all.slice(start, start + api.pageSize);
                if (api.duplicatePage && page.length) page.push(page[0]);
                return json({ files: page, incompleteSearch: api.incomplete,
                    ...(start + api.pageSize < all.length ? { nextPageToken: String(start + api.pageSize) } : {}) });
            }
            const file = files.get(path.split('/').at(-1));
            if (!file) return json({}, 404);
            if (parsed.searchParams.get('alt') === 'media') return new Response(file.bytes);
            return json(file.meta);
        },
    };
    return api;
}
