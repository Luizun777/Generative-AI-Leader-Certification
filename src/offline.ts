import { Capacitor } from '@capacitor/core';
export function registerOffline() {
  if (Capacitor.isNativePlatform()) {
    document.documentElement.dataset.offlineReady = 'true';
    return;
  }
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'PLIEGUE_OFFLINE_READY' && event.data.ready !== false) {
      document.documentElement.dataset.offlineReady = 'true';
      window.dispatchEvent(new Event('pliegue-offline-ready'));
    }
  });
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(async () => {
    const registration = await navigator.serviceWorker.ready;
    registration.active?.postMessage({type:'CHECK_OFFLINE'});
  }).catch(error => {
    console.warn('El modo sin conexión todavía no está disponible.', error);
    window.dispatchEvent(new Event('pliegue-offline-unavailable'));
  });
}
