import { defineConfig } from "vitest/config";

// The tests cover the pure logic shared by the app and the functions (dates, the task expansion,
// the digest) and the app's task writes against an in-memory copy of the tables (tests/mockdb.ts).
// Nothing here starts a browser or reaches Supabase or Claude.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
