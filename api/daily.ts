// Cron at 05:00 UTC (06:00 Tunis): fetches the weather (Phase 8), expands the care rules into tasks for
// the next 90 days, closes ended windows and stale waterings, skips the waterings a rain has done, then
// sends the push digest, one notification per site, with a weather notification first when there is an
// alert or a skip. A weather failure is reported and the rest runs as before. Only Vercel's cron secret
// opens this route. The notifications and the notes follow the language chosen in Settings (Phase
// 14), and the run ends by writing what it did to the `daily:last` settings row, so Today can tell a
// run that came after its read and Settings can say when it happened.
// `?dry=1` composes the digest without sending it, for checks; a dry run writes no record.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "./_http.js";
import { readStrings } from "./_lang.js";
import { failedRunRecord, writeDailyRecord, writeDailyStart } from "./_record.js";
import { runExpansion } from "./_tasks.js";
import { composeDigest, loadDigestTasks, sendDigest, type SendResult } from "./_push.js";
import { applyRainSkip, composeWeatherMessage, previewRainSkip, readWeatherSettings, refreshWeather, type RainSkip } from "./_weather.js";
import { bearerToken, ConfigError, handleError, sendError, serviceClient } from "./_supabase.js";
import { isoDateIn, SITE_TIME_ZONE } from "../src/lib/dates.js";
import type { DailyRecord, DailyResponse, WeatherDay } from "../src/types.js";

function flag(value: string | string[] | undefined): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "1" || v === "true";
}

/** web-push rejects a bad VAPID subject or key with a plain Error before any request goes out. */
function isVapidError(err: unknown): boolean {
  if (err instanceof ConfigError) return true;
  const e = err as { name?: string; statusCode?: number; message?: string };
  return e?.name === "Error" && e.statusCode === undefined && /vapid|subject|key/i.test(e.message ?? "");
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret || bearerToken(req) !== secret) {
    sendError(res, 401, "Unauthorized");
    return;
  }
  // Known outside the try, so a run that fails can still leave its record.
  let db: SupabaseClient | null = null;
  /** The record as written once the data was final, so a failure after it keeps the counts. */
  let written: DailyRecord | null = null;
  const today = isoDateIn(SITE_TIME_ZONE);
  const dryRun = flag(req.query.dry);
  try {
    db = serviceClient();
    const strings = await readStrings(db);
    if (!dryRun) await writeDailyStart(db, { at: new Date().toISOString(), today });

    let weatherDays: WeatherDay[] | null = null;
    let weatherError: string | undefined;
    try {
      weatherDays = (await refreshWeather(db, today)).days;
    } catch (err) {
      weatherError = err instanceof Error ? err.message : String(err);
    }

    const expansion = await runExpansion(db, today, undefined, strings);

    // After the expansion, so a watering it has just written for today is skipped too. A dry run
    // counts what it would close, for the message, and closes nothing.
    let rain: RainSkip = { decision: null, skipped: 0 };
    if (weatherDays) {
      try {
        const settings = await readWeatherSettings(db);
        rain = dryRun
          ? await previewRainSkip(db, weatherDays, today, settings)
          : await applyRainSkip(db, weatherDays, today, settings, new Date().toISOString(), strings);
      } catch (err) {
        weatherError = `rain skip: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    const digest = composeDigest(await loadDigestTasks(db, today), today, strings);
    const weatherMessage = weatherDays ? composeWeatherMessage(weatherDays, today, rain, strings) : null;

    // The data is final here: the record goes in before the pushes, so a read the first push sets
    // off already sees it; the push counts follow in a second write that keeps `at`.
    let send: SendResult = { sent: 0, failed: 0, subscriptions: 0, dropped: 0 };
    let digestError: string | undefined;
    let recordError: string | null = null;
    const record = (): DailyRecord => ({
      at: finalAt,
      today,
      created: expansion.created,
      removed: expansion.removed,
      expired: expansion.expired,
      superseded: expansion.superseded,
      skipped: rain.skipped,
      pushes_sent: send.sent,
      pushes_failed: send.failed,
      subscriptions: send.subscriptions,
      ...(weatherError ? { weather_error: weatherError } : {}),
      ...(digestError ? { digest_error: digestError } : {}),
    });
    const finalAt = new Date().toISOString();
    if (!dryRun) {
      recordError = await writeDailyRecord(db, record());
      if (recordError === null) written = record();
      try {
        send = await sendDigest(db, weatherMessage ? [weatherMessage, ...digest] : digest);
      } catch (err) {
        // A missing VAPID variable must not undo the expansion: the response reports it instead.
        if (!isVapidError(err)) throw err;
        digestError = (err as Error).message;
      }
      recordError = await writeDailyRecord(db, record());
      if (recordError === null) written = record();
    }

    const body: DailyResponse = {
      ok: true,
      today: expansion.today,
      plants: expansion.plants,
      created: expansion.created,
      removed: expansion.removed,
      expired: expansion.expired,
      superseded: expansion.superseded,
      tasks_created: expansion.created,
      tasks_removed: expansion.removed,
      pushes_sent: send.sent,
      pushes_failed: send.failed,
      subscriptions: send.subscriptions,
      subscriptions_dropped: send.dropped,
      digest,
      weather: { fetched: weatherDays !== null, skipped: rain.skipped, message: weatherMessage, ...(weatherError ? { error: weatherError } : {}) },
      dry_run: dryRun,
    };
    if (digestError) body.digest_error = digestError;
    if (recordError) body.record_error = recordError;
    res.status(200).json(body);
  } catch (err) {
    // A run that stopped short still says so in its record, so a failed morning is visible by breakfast.
    if (db && !dryRun) {
      // A failure after the data record was written keeps its counts: only the error is added.
      const failed = failedRunRecord(today, new Date().toISOString(), err);
      await writeDailyRecord(db, written ? { ...written, error: failed.error } : failed);
    }
    handleError(res, err);
  }
}
