// POST /api/push-subscribe  { subscription }                 ->  { ok, subscribed: true }
// POST /api/push-subscribe  { unsubscribe: true, endpoint }  ->  { ok, subscribed: false }
// DELETE /api/push-subscribe { endpoint }                    ->  { ok, subscribed: false }
// One row per browser, keyed by the push endpoint; the daily digest sends to every row.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleError, sendError, serviceClient, verifyUser } from "./_supabase.js";
import type { PushSubscribeRequest, PushSubscribeResponse, PushSubscriptionJson } from "../src/types.js";

const MAX_ENDPOINT = 2048;
const MAX_KEY = 256;

function isEndpoint(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("https://") && value.length <= MAX_ENDPOINT;
}

function isKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_KEY;
}

function parseSubscription(value: unknown): PushSubscriptionJson | null {
  const s = value as Partial<PushSubscriptionJson> | null;
  if (!s || typeof s !== "object" || !isEndpoint(s.endpoint)) return null;
  const keys = s.keys as Partial<PushSubscriptionJson["keys"]> | undefined;
  if (!keys || !isKey(keys.p256dh) || !isKey(keys.auth)) return null;
  return { endpoint: s.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

function endpointOf(req: VercelRequest): unknown {
  const body = (req.body ?? {}) as { endpoint?: unknown };
  if (body.endpoint !== undefined) return body.endpoint;
  const q = req.query.endpoint;
  return Array.isArray(q) ? q[0] : q;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    // The bearer check comes first: any request without a valid token is a 401, whatever the method.
    const user = await verifyUser(req);
    if (!user) {
      sendError(res, 401, "Unauthorized");
      return;
    }
    const db = serviceClient();

    if (req.method === "DELETE") {
      const endpoint = endpointOf(req);
      if (!isEndpoint(endpoint)) {
        sendError(res, 400, "endpoint must be an https URL");
        return;
      }
      const { error } = await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
      if (error) throw error;
      res.status(200).json({ ok: true, subscribed: false } satisfies PushSubscribeResponse);
      return;
    }

    if (req.method !== "POST") {
      sendError(res, 405, "Method not allowed");
      return;
    }

    const body = (req.body ?? {}) as Partial<PushSubscribeRequest>;
    if ("unsubscribe" in body && body.unsubscribe === true) {
      const endpoint = (body as { endpoint?: unknown }).endpoint;
      if (!isEndpoint(endpoint)) {
        sendError(res, 400, "endpoint must be an https URL");
        return;
      }
      const { error } = await db.from("push_subscriptions").delete().eq("endpoint", endpoint);
      if (error) throw error;
      res.status(200).json({ ok: true, subscribed: false } satisfies PushSubscribeResponse);
      return;
    }

    const subscription = parseSubscription((body as { subscription?: unknown }).subscription);
    if (!subscription) {
      sendError(res, 400, "subscription must carry an https endpoint and the p256dh and auth keys");
      return;
    }
    const { error } = await db
      .from("push_subscriptions")
      .upsert({ endpoint: subscription.endpoint, keys: subscription.keys }, { onConflict: "endpoint" });
    if (error) throw error;
    res.status(200).json({ ok: true, subscribed: true } satisfies PushSubscribeResponse);
  } catch (err) {
    handleError(res, err);
  }
}
