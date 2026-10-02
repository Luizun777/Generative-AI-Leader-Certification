import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const lists = await Promise.all(entries.map(entry => entry.isDirectory() ? walk(join(directory, entry.name)) : join(directory, entry.name)));
  return lists.flat();
}
const paths = (await walk(root)).filter(path => !/\.(apk|map)$/.test(path) && !path.endsWith('/sw.js')).sort();
const hash = createHash('sha256');
hash.update('pliegue-sw-v2');
for (const path of paths) hash.update(relative(root, path)).update(await readFile(path));
const version = hash.digest('hex').slice(0, 16);
const urls = paths.map(path => './' + relative(root, path));
const source = `const CACHE = 'pliegue-ia-${version}';
const ASSETS = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).catch(async error => { await caches.delete(CACHE); throw error; }));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('pliegue-ia-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
    for (const client of await self.clients.matchAll()) client.postMessage({type:'PLIEGUE_OFFLINE_READY'});
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'CHECK_OFFLINE') event.waitUntil(caches.open(CACHE).then(async cache => {
    const stored = await cache.keys();
    event.source?.postMessage({type:'PLIEGUE_OFFLINE_READY',ready:stored.length === ASSETS.length});
  }));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('.apk')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match('./index.html')) || fetch(event.request)));
    return;
  }
  // Precached public assets are identical for every Origin; Vite sends Vary: Origin.
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request, { ignoreVary: true })) || fetch(event.request)));
});
`;
await writeFile(join(root, 'sw.js'), source);
console.log(`PASS offline: ${urls.length} archivos precargados · versión ${version}`);
