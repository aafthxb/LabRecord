const VERSION = "labrecord-v2";

const STATIC_CACHE = [
    "/",
    "/index.html",
    "/style.css",
    "/script.js",
    "/site.webmanifest",

    "/generated/prism-loader.js",

    "/assets/icons/favicon.png",
    "/assets/icons/favicon-192.png",
    "/assets/icons/favicon-512.png",
    "/assets/icons/apple-touch-icon.png"
];

self.addEventListener("install", event => {

    event.waitUntil(

        caches.open(VERSION).then(async cache => {

            for (const file of STATIC_CACHE) {

                try {
                    await cache.add(file);
                } catch (err) {
                    console.warn("Failed:", file);
                }

            }

        })

    );

    self.skipWaiting();

});

self.addEventListener("activate", event => {

    event.waitUntil(

        caches.keys().then(keys =>
            Promise.all(

                keys
                    .filter(key => key !== VERSION)
                    .map(key => caches.delete(key))

            )
        )

    );

    self.clients.claim();

});

self.addEventListener("fetch", event => {

    if (event.request.method !== "GET") return;

    const url = new URL(event.request.url);

    // Ignore third-party resources
    if (url.origin !== self.location.origin) return;

    const path = url.pathname;

    // HTML
    if (event.request.mode === "navigate") {
        event.respondWith(networkFirst(event.request));
        return;
    }

    // Generated JSON
    if (
        path.startsWith("/generated/") &&
        path.endsWith(".json")
    ) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    // Everything else
    event.respondWith(cacheFirst(event.request));

});

async function cacheFirst(request) {

    const cache = await caches.open(VERSION);

    const cached = await cache.match(request);

    if (cached) {
        return cached;
    }

    const response = await fetch(request);

    if (response.ok) {
        cache.put(request, response.clone());
    }

    return response;

}

async function networkFirst(request) {

    const cache = await caches.open(VERSION);

    try {

        const response = await fetch(request);

        if (response.ok) {
            cache.put(request, response.clone());
        }

        return response;

    } catch {

        const cached = await cache.match(request);

        if (cached) {
            return cached;
        }

        if (request.mode === "navigate") {
            return cache.match("/index.html");
        }

        return new Response("Offline", {
            status: 503
        });

    }

}