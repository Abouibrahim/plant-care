/* Push handling for the Plant Care service worker.
 * Pulled into the generated worker (dist/sw.js) through `workbox.importScripts` in vite.config.ts,
 * so the precaching stays with vite-plugin-pwa and only this part is hand-written. Plain JavaScript:
 * it is served as is, outside the Vite bundle.
 *
 * Payload sent by api/_push.ts: { title, body, tag, url }. Every push also tells the open app
 * windows ({ type: "plantcare:push" }), so Today reads the morning run's result (Phase 13). */

/* global self, clients */

/** Tells the open app windows that a push arrived; a failure here never stops the notification. */
function tellWindows() {
  return clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then(function (list) {
      for (var i = 0; i < list.length; i++) list[i].postMessage({ type: "plantcare:push" });
    })
    .catch(function () {});
}

self.addEventListener("push", function (event) {
  var payload = {};
  if (event.data) {
    try {
      payload = event.data.json() || {};
    } catch (e) {
      payload = { body: event.data.text() };
    }
  }
  var title = payload.title || "Plant Care";
  var options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    tag: payload.tag || "plant-care",
    renotify: true,
    data: { url: payload.url || "/" },
  };
  event.waitUntil(Promise.all([self.registration.showNotification(title, options), tellWindows()]));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var path = (event.notification.data && event.notification.data.url) || "/";
  var url = new URL(path, self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var client = list[i];
        if (client.url.indexOf(self.location.origin) === 0 && "focus" in client) {
          return client.focus().then(function (focused) {
            var target = focused || client;
            if (target.url !== url && "navigate" in target) {
              return target.navigate(url).catch(function () {
                return target;
              });
            }
            return target;
          });
        }
      }
      return clients.openWindow(url);
    }),
  );
});
