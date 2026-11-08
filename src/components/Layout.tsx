import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import { BookOpen, Camera, Settings, Sprout, Sun, type LucideIcon } from "lucide-react";
import { t } from "../i18n";
import { useAuth } from "../lib/auth-context";
import { localIsoDate } from "../lib/dates";
import { countDueTasks, isOwner, TASKS_CHANGED } from "../lib/db";
import { syncLangWithServer } from "../lib/langSync";
import { dueCountOf, readQueue, recallToday } from "../lib/offline";

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Two tabs either side of the camera button in the middle of the bar. */
const LEFT_TABS: Tab[] = [
  { to: "/", label: t.nav.today, icon: Sun },
  { to: "/plants", label: t.nav.plants, icon: Sprout },
];
const RIGHT_TABS: Tab[] = [
  { to: "/species", label: t.nav.species, icon: BookOpen },
  { to: "/settings", label: t.nav.settings, icon: Settings },
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
 * Shown when the owners table exists and this account has no row in it: the policies close every
 * table to it (PHASE10.md). Asked once per sign-in; silent before the table exists or on a failed read.
 */
function OwnerBanner() {
  const { session } = useAuth();
  const [shutOut, setShutOut] = useState(false);

  useEffect(() => {
    let active = true;
    // Without a session (the shell on the phone's copy, Phase 14) the read would go out under the anon
    // key and say "not the owner" of nothing.
    if (!session) return;
    isOwner()
      .then((owner) => {
        if (active) setShutOut(owner === false);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [session]);

  if (!shutOut || !session) return null;
  return (
    <div className="banner warn update-banner" role="alert">
      {t.app.notOwner}
    </div>
  );
}

/**
 * Pending tasks due today or overdue, for the Today tab badge. Counted again on every navigation,
 * when a task is acted on or an expansion ran (the TASKS_CHANGED event) and when the app comes back
 * to the foreground, since the date may have turned. Mirrored to the app icon where the phone can.
 */
function useDueCount(pathname: string): number {
  const { session } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    // Offline, or without a session (the shell on the phone's copy, Phase 14): the list kept on the
    // phone counts instead, less the actions waiting; without one, the last count stays.
    const fromCopy = (today: string) => {
      const kept = recallToday(today);
      if (active && kept) setCount(dueCountOf(kept.tasks, readQueue(), today));
    };
    const load = () => {
      const today = localIsoDate();
      if (!session) {
        fromCopy(today);
        return;
      }
      countDueTasks(today)
        .then((n) => {
          if (active) setCount(n);
        })
        .catch(() => fromCopy(today));
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
  }, [pathname, session]);

  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    const promise = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
    promise.catch(() => undefined);
  }, [count]);

  return count;
}

export function Layout() {
  const { pathname } = useLocation();
  const due = useDueCount(pathname);

  // The language chosen in Settings reaches the server's row once per app start (Phase 14).
  useEffect(() => {
    void syncLangWithServer();
  }, []);

  const tabLink = (tab: Tab) => {
    const Icon = tab.icon;
    return (
      <NavLink key={tab.to} to={tab.to} end={tab.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
        <span className="nav-icon" aria-hidden>
          <Icon size={22} strokeWidth={2} />
          {tab.to === "/" && due > 0 && <span className="badge">{due > 99 ? "99+" : due}</span>}
        </span>
        <span className="nav-label">{tab.label}</span>
        {tab.to === "/" && due > 0 && <span className="visually-hidden">{t.nav.dueBadge(due)}</span>}
      </NavLink>
    );
  };

  return (
    <>
      <UpdateBanner />
      <OwnerBanner />
      <Outlet />
      <nav className="nav">
        {LEFT_TABS.map(tabLink)}
        <NavLink to="/capture" className={({ isActive }) => `nav-capture ${isActive ? "active" : ""}`} aria-label={t.nav.capture}>
          <span className="capture-btn" aria-hidden>
            <Camera size={26} strokeWidth={2} />
          </span>
        </NavLink>
        {RIGHT_TABS.map(tabLink)}
      </nav>
    </>
  );
}
