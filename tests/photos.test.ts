// The photos kept on the phone (src/lib/photoCache.ts) and loadPhoto (src/lib/db.ts) over a fake
// Cache API, a fake fetch and the in-memory bucket: a tile's thumbnail is signed and downloaded
// once, an older photo without a thumbnail falls back to its original, and both show again from the
// phone without the network.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetState, sharedState } from "./mockdb";

vi.mock("../src/lib/supabase", async () => {
  const { makeDb, sharedState } = await import("./mockdb");
  return { supabase: makeDb(sharedState), PHOTOS_BUCKET: "photos", supabaseConfigured: true };
});

/** The Cache API over a Map, in insertion order like the browsers'. */
class FakeCache {
  entries = new Map<string, Response>();
  private url(key: RequestInfo | URL): string {
    const raw = typeof key === "string" ? key : key instanceof URL ? key.href : key.url;
    return new URL(raw, "https://app.test").href;
  }
  async match(key: RequestInfo | URL): Promise<Response | undefined> {
    return this.entries.get(this.url(key))?.clone();
  }
  async put(key: RequestInfo | URL, res: Response): Promise<void> {
    const u = this.url(key);
    this.entries.delete(u);
    this.entries.set(u, res);
  }
  async delete(key: RequestInfo | URL): Promise<boolean> {
    return this.entries.delete(this.url(key));
  }
  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((u) => new Request(u));
  }
  paths(): string[] {
    return [...this.entries.keys()].map((u) => new URL(u).pathname);
  }
}

const cache = new FakeCache();
vi.stubGlobal("caches", { open: async () => cache });

/** Storage, over the bucket: the bytes of a path it holds, else 404. */
const fetchMock = vi.fn(async (input: string | URL | Request): Promise<Response> => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const path = url.pathname.slice(1);
  if (!sharedState.objects.has(path)) return new Response(null, { status: 404 });
  return new Response(new Blob([`bytes of ${path}`], { type: "image/jpeg" }), { status: 200, headers: { "Content-Type": "image/jpeg" } });
});
vi.stubGlobal("fetch", fetchMock);

const { loadPhoto, deletePlant } = await import("../src/lib/db");
const { forgetCachedPhotos, PHOTO_CACHE_MAX, readCachedPhoto, storeCachedPhoto, thumbPath } = await import("../src/lib/photoCache");

/** Lets the fire-and-forget stores land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const fetched = () => fetchMock.mock.calls.map((c) => new URL(String(c[0])).pathname.slice(1));

beforeEach(() => {
  resetState(sharedState);
  cache.entries.clear();
  fetchMock.mockClear();
});

describe("loadPhoto", () => {
  it("signs and downloads a tile's thumbnail once, then shows it from the phone", async () => {
    sharedState.objects.add("t1/1.jpg").add("t1/1.thumb.jpg");
    const first = await loadPhoto("t1/1.jpg", "thumb");
    expect(first.objectUrl).toBe(true);
    expect(first.url.startsWith("blob:")).toBe(true);
    expect(sharedState.signed).toEqual([["t1/1.thumb.jpg"]]);
    expect(fetched()).toEqual(["t1/1.thumb.jpg"]);
    await settle();
    expect(cache.paths()).toEqual(["/photo-cache/t1/1.thumb.jpg"]);
    const again = await loadPhoto("t1/1.jpg", "thumb");
    expect(again.objectUrl).toBe(true);
    expect(sharedState.signed).toHaveLength(1);
    expect(fetched()).toHaveLength(1);
  });

  it("falls back to the original of a photo stored before thumbnails, one signing round per screen", async () => {
    sharedState.objects.add("t2/1.jpg").add("t2/2.jpg");
    const [a, b] = await Promise.all([loadPhoto("t2/1.jpg", "thumb"), loadPhoto("t2/2.jpg", "thumb")]);
    expect(a.objectUrl && b.objectUrl).toBe(true);
    expect(sharedState.signed).toEqual([
      ["t2/1.thumb.jpg", "t2/2.thumb.jpg"],
      ["t2/1.jpg", "t2/2.jpg"],
    ]);
    expect(fetched()).toEqual(["t2/1.jpg", "t2/2.jpg"]);
    await settle();
    expect(cache.paths()).toEqual(["/photo-cache/t2/1.jpg", "/photo-cache/t2/2.jpg"]);
    // The tile now comes from the phone: no signing, no download.
    const offline = await loadPhoto("t2/1.jpg", "thumb");
    expect(offline.objectUrl).toBe(true);
    expect(sharedState.signed).toHaveLength(2);
    expect(fetched()).toHaveLength(2);
  });

  it("shows the full photo for the hero and keeps it", async () => {
    sharedState.objects.add("t3/1.jpg").add("t3/1.thumb.jpg");
    expect((await loadPhoto("t3/1.jpg", "full")).objectUrl).toBe(true);
    expect(sharedState.signed).toEqual([["t3/1.jpg"]]);
    await settle();
    expect(cache.paths()).toEqual(["/photo-cache/t3/1.jpg"]);
  });

  it("hands the signed URL to the browser when the download itself fails", async () => {
    sharedState.objects.add("t4/1.jpg");
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await loadPhoto("t4/1.jpg", "full")).toEqual({ url: "https://signed.test/t4/1.jpg?ttl=3600", objectUrl: false });
    expect(cache.entries.size).toBe(0);
  });

  it("gives up on a photo the bucket no longer holds", async () => {
    await expect(loadPhoto("t5/1.jpg", "thumb")).rejects.toThrow();
    expect(sharedState.signed).toEqual([["t5/1.thumb.jpg"], ["t5/1.jpg"]]);
  });

  it("still shows the photo where the Cache API is missing or refuses", async () => {
    sharedState.objects.add("t6/1.jpg").add("t6/1.thumb.jpg");
    vi.stubGlobal("caches", undefined);
    expect((await loadPhoto("t6/1.jpg", "thumb")).objectUrl).toBe(true);
    vi.stubGlobal("caches", {
      open: async () => {
        throw new Error("blocked");
      },
    });
    expect((await loadPhoto("t6/1.jpg", "full")).objectUrl).toBe(true);
    vi.stubGlobal("caches", { open: async () => cache });
    expect(cache.entries.size).toBe(0);
  });
});

describe("the photo cache", () => {
  it("names the thumbnail after its original", () => {
    expect(thumbPath("p1/1700000000000.jpg")).toBe("p1/1700000000000.thumb.jpg");
  });

  it("keeps about PHOTO_CACHE_MAX photos, dropping the oldest stored first", async () => {
    for (let i = 0; i < PHOTO_CACHE_MAX; i++) await storeCachedPhoto(`c/${i}.jpg`, new Blob(["x"], { type: "image/jpeg" }));
    expect(cache.entries.size).toBe(PHOTO_CACHE_MAX);
    await storeCachedPhoto("c/new1.jpg", new Blob(["x"]));
    await storeCachedPhoto("c/new2.jpg", new Blob(["x"]));
    expect(cache.entries.size).toBe(PHOTO_CACHE_MAX);
    expect(await readCachedPhoto("c/0.jpg")).toBeNull();
    expect(await readCachedPhoto("c/1.jpg")).toBeNull();
    expect((await readCachedPhoto("c/2.jpg"))?.size).toBe(1);
    expect((await readCachedPhoto("c/new2.jpg"))?.size).toBe(1);
  });

  it("forgets a plant's photos when it is deleted, and no other plant's", async () => {
    sharedState.plants.push({ id: "p1", species_id: null, tag: "Fig", site: "farm", planted_on: null });
    for (const path of ["p1/1.jpg", thumbPath("p1/1.jpg"), "p10/1.jpg"]) await storeCachedPhoto(path, new Blob(["x"]));
    await deletePlant("p1");
    expect(cache.paths()).toEqual(["/photo-cache/p10/1.jpg"]);
    await forgetCachedPhotos("p10");
    expect(cache.entries.size).toBe(0);
  });
});
