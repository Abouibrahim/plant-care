// Photos kept on the phone. The Cache API holds each photo's bytes under a stable same-origin key,
// `/photo-cache/<storage path>`, so a photo seen once shows on the next app start without a signing
// request or a download, signal or not. Signed URLs change every hour, which is why neither the
// browser's cache nor the service worker can keep a photo on their own. Every call here swallows the
// Cache API's failures (private mode, blocked storage, a full quota) and does nothing where `caches`
// does not exist (Node, the tests): the photo then comes from Storage as before.

const CACHE_NAME = "photo-cache";
const KEY_PREFIX = "/photo-cache/";
/** About this many photos are kept on the phone; past it, the oldest stored go first. */
export const PHOTO_CACHE_MAX = 500;

/** The thumbnail's path beside its original: `<plant id>/<ts>.thumb.jpg` for `<plant id>/<ts>.jpg`. */
export function thumbPath(storagePath: string): string {
  return `${storagePath.replace(/\.jpg$/, "")}.thumb.jpg`;
}

function cacheKey(storagePath: string): string {
  return `${KEY_PREFIX}${storagePath}`;
}

async function open(): Promise<Cache | null> {
  return typeof caches === "undefined" ? null : caches.open(CACHE_NAME);
}

/** Entries in the cache as far as this session knows: counted once, then kept up with the stores made here. */
let count: number | null = null;

/** The photo's bytes kept on the phone, or null when there are none (or the Cache API is unavailable). */
export async function readCachedPhoto(storagePath: string): Promise<Blob | null> {
  try {
    const cache = await open();
    const hit = cache ? await cache.match(cacheKey(storagePath)) : undefined;
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

/** Keeps a photo's bytes on the phone, dropping the oldest entries past `PHOTO_CACHE_MAX`. */
export async function storeCachedPhoto(storagePath: string, blob: Blob): Promise<void> {
  try {
    const cache = await open();
    if (!cache) return;
    if (count === null) count = (await cache.keys()).length;
    await cache.put(cacheKey(storagePath), new Response(blob, { headers: { "Content-Type": blob.type || "image/jpeg" } }));
    count += 1;
    if (count > PHOTO_CACHE_MAX) {
      // `keys()` lists the entries in the order they were stored.
      const keys = await cache.keys();
      const excess = Math.max(0, keys.length - PHOTO_CACHE_MAX);
      if (excess > 0) await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
      count = keys.length - excess;
    }
  } catch {
    // Private mode, blocked storage or a full quota: the photo shows all the same, and comes from Storage next time.
  }
}

/** Drops a plant's photos from the phone (their paths start with `<plant id>/`). */
export async function forgetCachedPhotos(plantId: string): Promise<void> {
  try {
    const cache = await open();
    if (!cache) return;
    const prefix = `${KEY_PREFIX}${plantId}/`;
    const gone = (await cache.keys()).filter((key) => new URL(key.url).pathname.startsWith(prefix));
    await Promise.all(gone.map((key) => cache.delete(key)));
    if (count !== null) count = Math.max(0, count - gone.length);
  } catch {
    // The entries stay until they are the oldest; nothing reads them again.
  }
}
