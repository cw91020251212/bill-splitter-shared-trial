self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch {}
    const title = payload.title === '分帳結果已準備好' ? payload.title : '分帳結果已準備好';
    const body = '開啟分帳管家，查看你的個人結果。';
    let target = new URL('./', self.registration.scope);
    try {
      const candidate = new URL(payload.url || './', self.registration.scope);
      if (candidate.origin === self.location.origin && candidate.pathname.startsWith(new URL(self.registration.scope).pathname)) target = candidate;
    } catch {}
    await self.registration.showNotification(title, {
      body,
      icon: new URL('icon.png', self.registration.scope).toString(),
      badge: new URL('icon.png', self.registration.scope).toString(),
      tag: 'bill-result-ready',
      renotify: false,
      data: { url: target.toString() },
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    let target = new URL('./', self.registration.scope);
    try {
      const candidate = new URL(event.notification.data?.url || './', self.registration.scope);
      if (candidate.origin === self.location.origin && candidate.pathname.startsWith(new URL(self.registration.scope).pathname)) target = candidate;
    } catch {}
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        await client.navigate(target.toString());
        return client.focus();
      }
    }
    return self.clients.openWindow(target.toString());
  })());
});
