// Today's weather card (Phase 8): today and the next three days at the sites, the rain of the last
// two days, the alerts with what to do, the spray windows still ahead, and what the 06:00 rain skip
// closed. Read from weather_days whenever Today reloads; when today's forecast is missing or more
// than six hours old it asks /api/weather, at most once every half hour, and reads again. Hidden
// until the table exists.
import { useEffect, useState } from "react";
import { CloudRain, CloudSun, Droplets, Snowflake, SprayCan, Sun, ThermometerSun, Wind, type LucideIcon } from "lucide-react";
import { Spinner } from "../../components/Spinner";
import { t } from "../../i18n";
import { api } from "../../lib/api";
import { addDays, toLocalDate } from "../../lib/dates";
import { listWeather, WeatherUnavailable } from "../../lib/db";
import { isFresh, rainBefore, RAIN_DAYS, upcomingAlerts, type AlertKind } from "../../lib/weather";
import type { WeatherDay } from "../../types";

/** Days after today shown in the row of small forecasts. */
const NEXT_DAYS = 3;
/** A refresh is tried at most this often, so a failing Open-Meteo or a phone offline is not hammered. */
const REFRESH_EVERY_MS = 30 * 60_000;
let lastRefreshAt = 0;

const ALERT_ICON: Record<AlertKind, LucideIcon> = { sirocco: ThermometerSun, heat: ThermometerSun, frost: Snowflake, gale: Wind, heavy_rain: CloudRain };

function round(v: number | null): string {
  return v === null ? "–" : String(Math.round(v));
}

function weekday(iso: string): string {
  const d = toLocalDate(iso);
  return d ? d.toLocaleDateString(undefined, { weekday: "short" }) : iso;
}

/** Rain, a hot sun or a mild day: the one icon for a day. */
function DayIcon({ day, size }: { day: WeatherDay | undefined; size: number }) {
  if (day && (day.rain_mm ?? 0) >= 1) return <CloudRain size={size} aria-hidden />;
  if (day && (day.tmax ?? 0) >= 30) return <Sun size={size} aria-hidden />;
  return <CloudSun size={size} aria-hidden />;
}

interface Props {
  today: string;
  /** The hour on the phone, so today's spray windows already past drop out. */
  hour: number;
  /** Changes whenever Today reloads (Refresh, a return after the 06:00 run, a new day): the rows are read again. */
  reloadKey: number;
}

export function WeatherCard({ today, hour, reloadKey }: Props) {
  const [days, setDays] = useState<WeatherDay[] | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let active = true;
    const from = addDays(today, -RAIN_DAYS);
    const to = addDays(today, NEXT_DAYS);
    async function load() {
      try {
        let rows = await listWeather(from, to);
        if (!active) return;
        setDays(rows);
        setUpdating(false);
        const now = Date.now();
        if (isFresh(rows.find((d) => d.day === today), new Date(now)) || now - lastRefreshAt < REFRESH_EVERY_MS) return;
        lastRefreshAt = now;
        setUpdating(true);
        try {
          await api.weather();
          rows = await listWeather(from, to);
          if (active) setDays(rows);
        } catch {
          // The stored rows stay on screen; the 06:00 run will try again.
        } finally {
          if (active) setUpdating(false);
        }
      } catch (err) {
        // Without the table (before the Phase 8 SQL) or on a failed read the card stays hidden.
        if (active && !(err instanceof WeatherUnavailable)) setDays([]);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [today, reloadKey]);

  if (days === null || (days.length === 0 && !updating)) return null;
  if (days.length === 0) {
    // The first fetch is under way: no figures to show yet.
    return (
      <section className="card weather-card" aria-label={t.weather.title}>
        <div className="card-head">
          <span className="head-icon water" aria-hidden>
            <CloudSun size={22} />
          </span>
          <h2>{t.weather.title}</h2>
          <Spinner label={t.weather.updating} />
        </div>
      </section>
    );
  }

  const todayRow = days.find((d) => d.day === today);
  const tomorrow = addDays(today, 1);
  const next = days.filter((d) => d.day > today).slice(0, NEXT_DAYS);
  const alerts = upcomingAlerts(days, today, NEXT_DAYS);
  const when = (day: string) => (day === today ? t.weather.when.today : day === tomorrow ? t.weather.when.tomorrow : weekday(day));
  const spray = [todayRow, days.find((d) => d.day === tomorrow)].filter((d): d is WeatherDay => d !== undefined);
  // Today's windows that have already ended drop out; "HH:00" labels compare as strings.
  const nowLabel = `${String(hour).padStart(2, "0")}:00`;
  const ahead = (d: WeatherDay) => (d.day === today ? d.spray.filter((w) => w.to > nowLabel) : d.spray);

  return (
    <section className="card weather-card" aria-label={t.weather.title}>
      <div className="card-head">
        <span className="head-icon water" aria-hidden>
          <DayIcon day={todayRow} size={22} />
        </span>
        <h2>{t.weather.title}</h2>
        {updating && <Spinner label={t.weather.updating} />}
      </div>

      {todayRow && (
        <div className="weather-today">
          <div>
            <strong>{t.weather.today}</strong> {t.weather.temps(round(todayRow.tmax), round(todayRow.tmin))}
          </div>
          <div className="small muted">
            {t.weather.rain(round(todayRow.rain_mm), todayRow.rain_prob)} ·{" "}
            {t.weather.wind(round(todayRow.wind_kmh), round(todayRow.gust_kmh))}
          </div>
        </div>
      )}

      {next.length > 0 && (
        <div className="weather-days">
          {next.map((d) => (
            <div key={d.day} className="weather-day">
              <span className="small muted">{weekday(d.day)}</span>
              <DayIcon day={d} size={18} />
              <span>{t.weather.temps(round(d.tmax), round(d.tmin))}</span>
              <span className="small muted">{t.weather.rain(round(d.rain_mm), d.rain_prob)}</span>
            </div>
          ))}
        </div>
      )}

      <p className="small muted" style={{ margin: "8px 0" }}>
        {t.weather.rainBefore(rainBefore(days, today))}
      </p>

      {alerts.map((a) => {
        const Icon = ALERT_ICON[a.kind];
        return (
          <div key={`${a.day}:${a.kind}`} className="banner warn weather-alert">
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <Icon size={18} aria-hidden />
              <strong>
                {t.weather.alertName[a.kind]} {when(a.day)}, {t.weather.alertValue(a.kind, a.value)}
              </strong>
            </div>
            <div className="small">{(a.day === today ? t.weather.adviceToday : t.weather.advice)[a.kind]}</div>
          </div>
        );
      })}

      {spray.length > 0 && (
        <div className="small" style={{ margin: "8px 0" }}>
          <div className="row" style={{ gap: 6, alignItems: "center" }}>
            <SprayCan size={16} aria-hidden />
            <strong>{t.weather.sprayTitle}</strong>
          </div>
          {spray.map((d) => (
            <div key={d.day}>
              {t.weather.sprayDay(when(d.day), ahead(d).length > 0 ? ahead(d).map((w) => t.weather.sprayWindow(w.from, w.to)).join(", ") : t.weather.sprayNone)}
            </div>
          ))}
        </div>
      )}

      {todayRow && todayRow.skipped > 0 && (
        <p className="small row" style={{ gap: 6, alignItems: "center", margin: "8px 0" }}>
          <Droplets size={16} aria-hidden />
          {t.weather.skippedToday(todayRow.skipped)}
        </p>
      )}

      <p className="small muted" style={{ margin: 0 }}>
        {todayRow && <>{t.weather.fetchedAt(new Date(todayRow.fetched_at).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }))} · </>}
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          {t.weather.credit}
        </a>
      </p>
    </section>
  );
}
