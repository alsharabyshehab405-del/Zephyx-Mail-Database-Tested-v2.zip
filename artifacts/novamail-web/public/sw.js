const CACHE_NAME = "zephyx-mail-shell-v5";
const SHELL = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match("/"))));
});

function safeNotificationPayload(raw) {
  const payload = raw && typeof raw === "object" ? raw : {};
  const emailId = typeof payload.emailId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(payload.emailId) ? payload.emailId : null;
  const route = emailId ? `/inbox/${encodeURIComponent(emailId)}` : "/inbox";
  return {
    title: typeof payload.title === "string" ? payload.title.slice(0, 120) : "Zephyx Mail",
    body: typeof payload.summary === "string" ? payload.summary.slice(0, 180) : "You have a new mail update",
    route,
    emailId,
  };
}

self.addEventListener("push", (event) => {
  const raw = event.data ? event.data.json() : {};
  const payload = safeNotificationPayload(raw);
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    data: { route: payload.route, emailId: payload.emailId },
    tag: payload.emailId ? `email-${payload.emailId}` : "mail-update",
  }));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SHOW_NOTIFICATION" && self.registration.showNotification) {
    const payload = safeNotificationPayload(event.data);
    event.waitUntil(self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { route: payload.route, emailId: payload.emailId },
    }));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const route = typeof event.notification.data?.route === "string" && event.notification.data.route.startsWith("/") ? event.notification.data.route : "/inbox";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const client = clients.find((candidate) => "focus" in candidate);
    return client ? client.navigate(route).then(() => client.focus()) : self.clients.openWindow(route);
  }));
});
