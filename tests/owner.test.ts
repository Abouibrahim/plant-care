// isOwner (src/lib/db.ts): the account's row in owners, its absence, and the table not existing yet
// (before the Phase 10 SQL), with the browser client replaced by a stub that answers what the test says.
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Answer {
  data: unknown;
  error: { code: string; message: string } | null;
}

interface Chain {
  limit(n: number): Chain;
  maybeSingle(): Promise<Answer>;
}

const stub = vi.hoisted(() => ({
  answer: { data: null, error: null } as Answer,
  calls: [] as Array<{ table: string; columns: string }>,
}));

vi.mock("../src/lib/supabase", () => ({
  supabaseConfigured: true,
  PHOTOS_BUCKET: "photos",
  supabase: {
    from: (table: string) => ({
      select: (columns: string) => {
        stub.calls.push({ table, columns });
        const chain: Chain = { limit: () => chain, maybeSingle: () => Promise.resolve(stub.answer) };
        return chain;
      },
    }),
  },
}));

const { isOwner } = await import("../src/lib/db");

beforeEach(() => {
  stub.calls.length = 0;
  stub.answer = { data: null, error: null };
});

describe("isOwner", () => {
  it("reads the account's own row from owners", async () => {
    stub.answer = { data: { user_id: "u1" }, error: null };
    expect(await isOwner()).toBe(true);
    expect(stub.calls).toEqual([{ table: "owners", columns: "user_id" }]);
  });

  it("is false when the table holds no row for the account", async () => {
    expect(await isOwner()).toBe(false);
  });

  it("says nothing before the table exists, or when the read fails", async () => {
    stub.answer = { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.owners' in the schema cache" } };
    expect(await isOwner()).toBeNull();
    stub.answer = { data: null, error: { code: "", message: "Failed to fetch" } };
    expect(await isOwner()).toBeNull();
  });
});
