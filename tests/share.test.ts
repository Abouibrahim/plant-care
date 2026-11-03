// Handing a kind's list to the share sheet (Phase 13): the text alone, a dismissed sheet changes
// nothing, and a phone with no share sheet, or one that refuses, copies the text instead.
import { describe, expect, it, vi } from "vitest";
import { shareText, type ShareTarget } from "../src/lib/share";

const failure = (name: string) => Object.assign(new Error(name), { name });

/** A phone with the given share sheet and clipboard, either missing when not given. */
function target(share?: ShareTarget["share"], writeText?: (text: string) => Promise<void>): ShareTarget {
  return { share, clipboard: writeText ? { writeText } : undefined };
}

describe("sharing a kind's list", () => {
  it("opens the share sheet with the text alone", async () => {
    const share = vi.fn(async () => undefined);
    const writeText = vi.fn(async () => undefined);
    expect(await shareText("Water · Farm", target(share, writeText))).toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ text: "Water · Farm" });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("asks for the sheet as the navigator's own method, before anything is awaited, so it runs within the tap", async () => {
    let calls = 0;
    const nav: ShareTarget = {
      share(this: unknown) {
        // Chrome's navigator.share throws "Illegal invocation" when called off its navigator.
        if (this !== nav) return Promise.reject(new TypeError("Illegal invocation"));
        calls += 1;
        return Promise.resolve();
      },
    };
    const pending = shareText("Water · Farm", nav);
    expect(calls).toBe(1);
    expect(await pending).toBe("shared");
  });

  it("does nothing when the sheet is dismissed", async () => {
    const writeText = vi.fn(async () => undefined);
    const nav = target(() => Promise.reject(failure("AbortError")), writeText);
    expect(await shareText("Water · Farm", nav)).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("copies the text where there is no share sheet, or when it refuses", async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await shareText("Water · Farm", target(undefined, writeText))).toBe("copied");
    expect(writeText).toHaveBeenLastCalledWith("Water · Farm");
    const refused = target(() => Promise.reject(failure("NotAllowedError")), writeText);
    expect(await shareText("Prune · Farm", refused)).toBe("copied");
    expect(writeText).toHaveBeenLastCalledWith("Prune · Farm");
  });

  it("fails when neither works", async () => {
    await expect(shareText("Water · Farm", target())).rejects.toThrow();
    const nav = target(
      () => Promise.reject(failure("DataError")),
      () => Promise.reject(failure("NotAllowedError")),
    );
    await expect(shareText("Water · Farm", nav)).rejects.toThrow();
  });
});
