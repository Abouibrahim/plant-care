// POST /api/weather  ->  { days, point }
// Today calls it when the stored forecast is missing or more than six hours old: the forecast is
// fetched from Open-Meteo for the sites and stored in weather_days. No Claude call, and no rain skip,
// which stays with the 06:00 run.
import type { VercelRequest, VercelResponse } from "./_http.js";
import { handleError, sendError, serviceClient, verifyUser } from "./_supabase.js";
import { refreshWeather, WeatherUnavailable } from "./_weather.js";
import { isoDateIn, SITE_TIME_ZONE } from "../src/lib/dates.js";
import type { WeatherResponse } from "../src/types.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    // The bearer check comes first: any request without a valid token is a 401, whatever the method.
    const user = await verifyUser(req);
    if (!user) {
      sendError(res, 401, "Unauthorized");
      return;
    }
    if (req.method !== "POST") {
      sendError(res, 405, "Method not allowed");
      return;
    }
    const result: WeatherResponse = await refreshWeather(serviceClient(), isoDateIn(SITE_TIME_ZONE));
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof WeatherUnavailable) {
      sendError(res, 503, err.message);
      return;
    }
    if (err instanceof Error && /Open-Meteo|aborted|fetch failed/i.test(err.message)) {
      sendError(res, 502, `Weather service: ${err.message}`);
      return;
    }
    handleError(res, err);
  }
}
