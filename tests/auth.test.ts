import { describe, expect, it } from "vitest";
import { isTokenRejected } from "../api/_supabase.js";

// Shapes of the auth-js error classes verifyUser sees: a verdict on the token answers 401, a fault
// of Supabase Auth or the network throws (502/500), since the phone signs out on a 401.
describe("isTokenRejected", () => {
  it("treats GoTrue's 4xx verdicts as a rejected token", () => {
    expect(isTokenRejected({ name: "AuthApiError", status: 401 })).toBe(true);
    expect(isTokenRejected({ name: "AuthApiError", status: 403 })).toBe(true);
    expect(isTokenRejected({ name: "AuthInvalidJwtError", status: 400 })).toBe(true);
    expect(isTokenRejected({ name: "AuthSessionMissingError", status: 400 })).toBe(true);
  });

  it("treats everything else as a fault to throw", () => {
    expect(isTokenRejected({ name: "AuthRetryableFetchError", status: 0 })).toBe(false);
    expect(isTokenRejected({ name: "AuthRetryableFetchError", status: 503 })).toBe(false);
    expect(isTokenRejected({ name: "AuthUnknownError", status: undefined })).toBe(false);
    expect(isTokenRejected({ name: "AuthApiError", status: 429 })).toBe(false);
    expect(isTokenRejected({ name: "AuthApiError", status: 500 })).toBe(false);
    expect(isTokenRejected({ name: "TypeError" })).toBe(false);
  });
});
