import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import { t } from "../i18n";
import { localIsoDate } from "../lib/dates";
import { countDueTasks, TASKS_CHANGED } from "../lib/db";

const tabs = [
  { to: "/", label: t.nav.today, icon: "☀" },
  { to: "/plants", label: t.nav.plants, icon: "🌿" },
  { to: "/species", label: t.nav.species, icon: "📖" },
  { to: "/settings", label: t.nav.settings, icon: "⚙" },
];

/** Registers the service worker; when a new build is waiting, offers a reload instead of forcing one. */
function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  if (!needRefresh) return null;
  return (
    <div className="banner info row between update-banner" role="status">
      <span>{t.app.updateReady}</span>
      <button type="button" className="primary small" onClick={() => void updateServiceWorker(true)}>
        {t.app.reload}
      </button>
    </div>
  );
}

/**
 * Pending tasks due today or overdue, for the Today tab badge. Counted again on every navigation,
 * when a task is acted on or an expansion ran (the TASKS_CHANGED event) and when the app comes back
 * to the foreground, since the date may have turned. Mirrored to the app icon where the phone can.
 */
function useDueCount(pathname: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () => {
      countDueTasks(localIsoDate())
        .then((n) => {
          if (active) setCount(n);
        })
        .catch(() => {
          // Offline or signed out: keep the last count rather than flashing zero.
        });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    load();
    window.addEventListener(TASKS_CHANGED, load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.removeEventListener(TASKS_CHANGED, load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    const promise = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
    promise.catch(() => undefined);
  }, [count]);

  return count;
}

export function Layout() {
  const { pathname } = useLocation();
  const onCapture = pathname.startsWith("/capture");
  const due = useDueCount(pathname);
  return (
    <>
      <UpdateBanner />
      <Outlet />
      {!onCapture && (
        <NavLink to="/capture" className="fab" aria-label={t.nav.capture}>
          📷
        </NavLink>
      )}
      <nav className="nav">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
            <span className="icon" aria-hidden>
              {tab.icon}
            </span>
            {tab.label}
            {tab.to === "/" && due > 0 && (
              <span className="badge" aria-label={t.nav.dueBadge(due)}>
                {due > 99 ? "99+" : due}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
