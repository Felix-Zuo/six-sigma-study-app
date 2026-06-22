const CACHE_NAME = "six-sigma-study-v0.5.0";
const CORE_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/content/catalog.json",
  "/content/manual.json",
  "/content/assets/asset-manifest.json"
];

async function cacheApplicationShell(cache) {
  const response = await fetch("/index.html", { cache: "reload" });
  if (!response.ok) {
    throw new Error(`index preload failed: ${response.status}`);
  }

  const html = await response.clone().text();
  await cache.put("/", response.clone());
  await cache.put("/index.html", response);

  const urls = new Set(CORE_ASSETS);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = new URL(match[1], self.location.origin);
    if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
      urls.add(url.pathname);
    }
  }
  await cache.addAll([...urls]);
}

async function cacheFigureAssets(cache) {
  try {
    const response = await fetch("/content/assets/asset-manifest.json");
    if (!response.ok) {
      return;
    }
    const manifest = await response.json();
    const paths = Array.isArray(manifest.assets)
      ? manifest.assets.map((asset) => `/content/${asset.path}`)
      : [];
    await cache.addAll(paths);
  } catch (error) {
    console.warn("figure precache skipped", error);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cacheApplicationShell(cache).then(() => cacheFigureAssets(cache)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/") || caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
