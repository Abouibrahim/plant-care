// The one reading of a failure the screens share (src/lib/errors.ts, Phase 15), and the network check it rests on (Phase 14).
import { describe, expect, it } from "vitest";
import { t } from "../src/i18n";
import { ApiError, describeError, isNetworkFailure, LostReplyError } from "../src/lib/errors";

describe("describeError", () => {
  it("says what a function's failure is in the app's words", () => {
    expect(describeError(new LostReplyError(new ApiError(0, "Failed to fetch")))).toBe(t.errors.answerLost);
    expect(describeError(new ApiError(401, "Invalid token"))).toBe(t.errors.unauthorized);
    expect(describeError(new ApiError(0, "The reply was cut off"))).toBe(t.errors.network);
    expect(describeError(new ApiError(413, "Payload too large"))).toBe(t.errors.tooLarge);
    expect(describeError(new ApiError(502, "Claude is overloaded; try again"))).toBe("Claude is overloaded; try again");
    expect(describeError(new ApiError(500, ""))).toBe(t.errors.generic);
    // A function's own text stays as written, even when it sounds like the network (api/_supabase.ts handleError).
    expect(describeError(new ApiError(500, "Request timed out."))).toBe("Request timed out.");
  });

  it("never shows the browser's own wording", () => {
    expect(describeError(new TypeError("Failed to fetch"))).toBe(t.errors.network);
    expect(describeError(new Error("TypeError: Failed to fetch"))).toBe(t.errors.network);
    expect(describeError(new Error("TimeoutError: signal timed out"))).toBe(t.errors.network);
    expect(describeError(new Error("Load failed"))).toBe(t.errors.network);
    // The sign-in without a connection (auth-js's AuthRetryableFetchError), as the Login screen gets it.
    expect(describeError(Object.assign(new Error("Failed to fetch"), { name: "AuthRetryableFetchError", status: 0 }))).toBe(t.errors.network);
  });

  it("keeps the database's own message, and has a line for the rest", () => {
    expect(describeError(new Error("duplicate key value violates unique constraint"))).toBe("duplicate key value violates unique constraint");
    expect(describeError(new Error(""))).toBe(t.errors.generic);
    expect(describeError("Failed to fetch")).toBe(t.errors.generic);
    expect(describeError(null)).toBe(t.errors.generic);
    // A push service refusing a subscription: its reason, not "no connection".
    expect(describeError(new DOMException("Registration failed - push service error", "AbortError"))).toBe("Registration failed - push service error");
    expect(describeError(new Error("The photo upload failed"))).toBe("The photo upload failed");
  });
});

describe("isNetworkFailure", () => {
  it("knows the browser's wording for a request without an answer, a bound that ran out and an abort, and nothing else", () => {
    expect(isNetworkFailure(new Error("TypeError: Failed to fetch"))).toBe(true);
    expect(isNetworkFailure(new TypeError("NetworkError when attempting to fetch resource."))).toBe(true);
    expect(isNetworkFailure(new Error("Load failed"))).toBe(true);
    expect(isNetworkFailure(new TypeError("TypeError: Load failed"))).toBe(true);
    // The 8 s bound on a task write (AbortSignal.timeout), as supabase-js reports it.
    expect(isNetworkFailure(new Error("TimeoutError: signal timed out"))).toBe(true);
    expect(isNetworkFailure(new Error("AbortError: The user aborted a request."))).toBe(true);
    expect(isNetworkFailure(new DOMException("signal timed out", "TimeoutError"))).toBe(true);
    // A programming error is not a lost connection, whatever its class.
    expect(isNetworkFailure(new TypeError("x is not a function"))).toBe(false);
    expect(isNetworkFailure(new Error("The photo upload failed"))).toBe(false);
    expect(isNetworkFailure(new DOMException("Registration failed - push service error", "AbortError"))).toBe(false);
    expect(isNetworkFailure(new Error("duplicate key value violates unique constraint"))).toBe(false);
    expect(isNetworkFailure("Failed to fetch")).toBe(false);
  });
});
