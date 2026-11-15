const CACHE_NAME = "six-sigma-study-v0.9.0";
const CORE_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/content/catalog.json",
  "/content/dictionary.json",
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

async function cacheBookPackages(cache) {
  try {
    const response = await fetch("/content/catalog.json", { cache: "reload" });
    if (!response.ok) {
      return;
    }
    const catalog = await response.json();
    const paths = Array.isArray(catalog.books)
      ? catalog.books
          .map((book) => book && book.contentPath)
          .filter(Boolean)
          .map((path) => `/${path}`)
      : [];
    if (paths.length > 0) {
      await cache.addAll([...new Set(paths)]);
    }
  } catch (error) {
    console.warn("book package precache skipped", error);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cacheApplicationShell(cache).then(() => cacheBookPackages(cache)).then(() => cacheFigureAssets(cache)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("six-sigma-study-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (new URL(request.url).pathname.startsWith("/api/") || request.headers.has("Authorization")) return;
  if (request.method !== "GET") {
    return;
  }

  if (request.mode === "navigate") {
    const navigationUrl = new URL(request.url);
    const isApplicationShell = navigationUrl.origin === self.location.origin
      && ["/", "/index.html"].includes(navigationUrl.pathname);
    // Standalone pages (including the private pairing entry) must never replace
    // the offline reader shell or fall back to a different page's contents.
    if (!isApplicationShell) return;
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          const contentType = response.headers.get("content-type") || "";
          if (response.ok && !response.redirected && contentType.includes("text/html")) {
            try {
              const cache = await caches.open(CACHE_NAME);
              await cache.put("/", response.clone());
              await cache.put("/index.html", response.clone());
            } catch {
              // A cache quota failure must not turn an available online page
              // into a failed navigation. The previous offline shell survives.
            }
          }
          return response;
        })
        .catch(async () => (await caches.match("/")) || (await caches.match("/index.html")) || Response.error())
    );
    return;
  }

  const requestUrl = new URL(request.url);
  if (requestUrl.pathname === "/content/private/question-bank.private.json") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          const contentType = response.headers.get("content-type") || "";
          if (!response.ok || !contentType.includes("application/json")) {
            throw new Error(`private bank response rejected: ${response.status} ${contentType}`);
          }
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error()))
    );
    return;
  }

  if (requestUrl.pathname.startsWith("/content/") && requestUrl.pathname.endsWith(".json")) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`content response rejected: ${response.status}`);
          }
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error()))
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
