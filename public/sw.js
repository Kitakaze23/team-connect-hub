// Push Notification Service Worker
self.addEventListener("push", (event) => {
  let data = { title: "Уведомление", body: "", data: {} };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch (e) {
    console.error("SW push parse error:", e);
  }

  const options = {
    body: data.body || "",
    icon: data.icon || "/favicon.ico",
    badge: data.badge || "/favicon.ico",
    tag: data.tag || "default",
    requireInteraction: data.type === "call",
    data: data.data || {},
    vibrate: data.type === "call" ? [200, 100, 200, 100, 200] : [200],
    actions: data.type === "call"
      ? [
          { action: "answer", title: "Ответить" },
          { action: "decline", title: "Отклонить" },
        ]
      : [],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          if (event.action === "answer" && event.notification.data?.conversationId) {
            client.postMessage({
              type: "PUSH_ACTION",
              action: "answer_call",
              conversationId: event.notification.data.conversationId,
            });
          }
          return;
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
