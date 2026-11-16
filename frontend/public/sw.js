self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { message: event.data?.text() || "You have a new task manager update." };
  }

  const title = payload.title || "FLIPPRO Task Manager";
  const options = {
    body: payload.message || "You have a new task or ticket assignment.",
    icon: "/icon.png",
    badge: "/icon.png",
    tag: payload.tag || "flippro-assignment",
    data: { link: payload.link || "/dashboard" },
    renotify: true,
  };
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const activeDashboard = windows.find((client) => {
      if (client.visibilityState !== "visible") return false;
      try {
        return new URL(client.url).pathname.startsWith("/dashboard");
      } catch {
        return false;
      }
    });
    if (activeDashboard) {
      activeDashboard.postMessage({ type: "push-notification", notification: payload });
      return;
    }
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedLink = event.notification.data?.link || "/dashboard";
  let targetUrl = new URL("/dashboard", self.location.origin);
  try {
    const candidate = new URL(requestedLink, self.location.origin);
    if (candidate.origin === self.location.origin) targetUrl = candidate;
  } catch {
    // Keep the safe dashboard fallback.
  }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        await client.navigate(targetUrl.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl.href);
  })());
});
