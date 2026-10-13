import { registerSW } from 'virtual:pwa-register';

// autoUpdate: a new version installs, activates and reloads the page by itself.
// Also look for a new version whenever the app comes back to the foreground.
export function initPwa() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => registration.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      setInterval(check, 30 * 60 * 1000);
    },
  });
}

// Manual refresh: drop the app-file cache and service worker, then reload.
// Does not touch login, the offline visit queue or anything saved in localStorage/IndexedDB.
export async function forceUpdate() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } finally {
    window.location.reload();
  }
}
