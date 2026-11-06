// Notificaciones en el celular (Web Push) para IT: avisan los tickets Críticos aunque la app esté cerrada.
// Funciona con la app abierta directo (no dentro de GrassiNet). En iPhone, primero hay que agregarla a la pantalla de inicio.
const VAPID_PUBLICA = 'BDuWW_6qtHRrumxwVvH5NhkmP_YliJT5aOXzMliSugGkHM9zw9_E-BsApJPXK4EHRf-Aog-MZnf6oUvA_C293hY';

const b64aBytes = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)); };
const enIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// qué se puede hacer en este dispositivo: 'ok' | 'iframe' | 'ios-instalar' | 'no-soportado' | 'bloqueado'
export function disponibilidad() {
  if (enIframe) return 'iframe';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return esIOS && !instalada ? 'ios-instalar' : 'no-soportado';
  if (Notification.permission === 'denied') return 'bloqueado';
  return 'ok';
}

async function registro() { return navigator.serviceWorker.register('sw.js', { scope: './' }); }

export async function estadoActual() {
  if (disponibilidad() !== 'ok') return null;
  const reg = await navigator.serviceWorker.getRegistration('./');
  return reg ? await reg.pushManager.getSubscription() : null;
}

export async function activar(api) {
  const permiso = await Notification.requestPermission();
  if (permiso !== 'granted') throw new Error('No diste permiso para mostrar notificaciones');
  const reg = await registro();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(VAPID_PUBLICA) });
  const disp = /android/i.test(navigator.userAgent) ? 'Android' : esIOS ? 'iPhone' : /mac/i.test(navigator.userAgent) ? 'Mac' : /windows/i.test(navigator.userAgent) ? 'Windows' : 'Otro';
  await api.guardarPush(sub, disp);
  return sub;
}

export async function desactivar(api) {
  const sub = await estadoActual();
  if (!sub) return;
  await api.quitarPush(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}
