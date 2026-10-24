// Web Push on the phone: permission, the browser subscription through the service worker, and the
// matching row on the server (POST /api/push-subscribe). The Settings screen is the only caller.
import { api } from "./api";

export type PushState = "on" | "off" | "blocked" | "unsupported" | "no-key";

/** The VAPID public key the browser subscribes with; blank when the build had no VITE_VAPID_PUBLIC_KEY. */
const PUBLIC_KEY = ((import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? "").trim();

/** How long to wait for the service worker registration (none ever comes in `npm run dev`). */
const REGISTRATION_TIMEOUT_MS = 8_000;

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** The active registration, or null when none arrives in time. */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing?.active) return existing;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), REGISTRATION_TIMEOUT_MS)),
  ]);
}

/** The applicationServerKey as the Push API wants it. */
function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (!PUBLIC_KEY) return "no-key";
  const reg = await registration();
  if (!reg) return "unsupported";
  const sub = await reg.pushManager.getSubscription();
  return sub ? "on" : "off";
}

export class PushError extends Error {
  state: PushState;
  constructor(state: PushState, message: string) {
    super(message);
    this.name = "PushError";
    this.state = state;
  }
}

/**
 * Asks permission, subscribes through the service worker and stores the subscription on the server.
 * If the server rejects it, the browser subscription is removed again so the card stays truthful.
 * Resolves to the new state.
 */
export async function enablePush(strings: { denied: string; failed: string }): Promise<PushState> {
  if (!pushSupported()) throw new PushError("unsupported", strings.failed);
  if (!PUBLIC_KEY) throw new PushError("no-key", strings.failed);
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission === "denied") throw new PushError("blocked", strings.denied);
  if (permission !== "granted") throw new PushError("off", strings.denied);

  const reg = await registration();
  if (!reg) throw new PushError("unsupported", strings.failed);

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const options: PushSubscriptionOptionsInit = { userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) };
    try {
      sub = await reg.pushManager.subscribe(options);
    } catch (err) {
      // A subscription made with an older key pair blocks a new one: drop it and try once more.
      if ((err as Error)?.name !== "InvalidStateError") throw err;
      const stale = await reg.pushManager.getSubscription();
      if (stale) await stale.unsubscribe();
      sub = await reg.pushManager.subscribe(options);
    }
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    await sub.unsubscribe();
    throw new PushError("off", strings.failed);
  }
  try {
    await api.pushSubscribe({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
  } catch (err) {
    await sub.unsubscribe().catch(() => undefined);
    throw err;
  }
  return "on";
}

/** Removes the server row first, then the browser subscription; resolves to the new state. */
export async function disablePush(): Promise<PushState> {
  const reg = await registration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return getPushState();
  await api.pushUnsubscribe(sub.endpoint);
  await sub.unsubscribe();
  return "off";
}
