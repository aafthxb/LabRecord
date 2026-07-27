const VERSION = "labrecord-v1.0.0";

const APP_SHELL = [
    "/",
    "/index.html",
    "/style.css",
    "/script.js",
    "/site.webmanifest",

    "/generated/language-index.json",
    "/generated/search-index.json",
    "/generated/site-info.json",

    "/generated/prism-loader.js",

    "/assets/icons/favicon.png",
    "/assets/icons/favicon-192.png",
    "/assets/icons/favicon-512.png",
    "/assets/icons/apple-touch-icon.png"
];

self.addEventListener("install", event => {

    event.waitUntil(
    caches.open(VERSION).then(async cache => {

        await Promise.all(

            APP_SHELL.map(async asset => {

                try {
                    await cache.add(asset);
                } catch (err) {
                    console.warn("Failed to cache:", asset);
                }

            })

        );

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

    // Only cache requests from your own website
    if (url.origin !== self.location.origin) {
        return;
    }

    event.respondWith(

        caches.match(event.request).then(cached => {

            if (cached) {
                return cached;
            }

            return fetch(event.request)
                .then(network => {

                    const copy = network.clone();

                    caches.open(VERSION)
                        .then(cache => cache.put(event.request, copy));

                    return network;

                })
                .catch(() => caches.match("/index.html"));

        })

    );

});