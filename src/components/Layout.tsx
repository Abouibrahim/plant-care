import { NavLink, Outlet, useLocation } from "react-router-dom";
import { t } from "../i18n";

const tabs = [
  { to: "/", label: t.nav.today, icon: "☀" },
  { to: "/plants", label: t.nav.plants, icon: "🌿" },
  { to: "/species", label: t.nav.species, icon: "📖" },
  { to: "/settings", label: t.nav.settings, icon: "⚙" },
];

export function Layout() {
  const { pathname } = useLocation();
  const onCapture = pathname.startsWith("/capture");
  return (
    <>
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
