import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import { t } from "../i18n";

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

export function Layout() {
  const { pathname } = useLocation();
  const onCapture = pathname.startsWith("/capture");
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
          </NavLink>
        ))}
      </nav>
    </>
  );
}
