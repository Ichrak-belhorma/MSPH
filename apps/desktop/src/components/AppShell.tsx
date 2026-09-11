import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { USER_ROLE_LABELS_FR } from "../lib/labels.js";
import { initials } from "../lib/format.js";
import {
  IconCalendar,
  IconCases,
  IconCustomers,
  IconDashboard,
  IconLogOut,
  IconProperties,
  IconSettings,
  IconTreatments,
  IconWorkers,
} from "./icons.js";

const NAV_ITEMS = [
  { to: "/", label: "Tableau de bord", icon: IconDashboard, end: true },
  { to: "/dossiers", label: "Dossiers", icon: IconCases },
  { to: "/calendrier", label: "Calendrier", icon: IconCalendar },
  { to: "/clients", label: "Clients", icon: IconCustomers },
  { to: "/proprietes", label: "Propriétés", icon: IconProperties },
  { to: "/traitements", label: "Traitements", icon: IconTreatments },
  { to: "/intervenants", label: "Intervenants", icon: IconWorkers },
  { to: "/parametres", label: "Paramètres", icon: IconSettings },
] as const;

function pageTitle(pathname: string): string {
  if (pathname === "/") return "Tableau de bord";
  if (pathname.startsWith("/dossiers/nouveau")) return "Nouveau dossier";
  if (pathname.startsWith("/dossiers/")) return "Dossier";
  const match = NAV_ITEMS.find((item) => item.to !== "/" && pathname.startsWith(item.to));
  return match?.label ?? "MSPH";
}

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand__mark">MS</div>
          <div>
            <div className="sidebar-brand__name">MSPH</div>
            <div className="sidebar-brand__sub">Gestion d'interventions</div>
          </div>
        </div>
        <ul className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <NavLink to={item.to} end={"end" in item ? item.end : false}>
                  <Icon className="nav-icon" />
                  {item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
        {user && (
          <div className="sidebar-footer">
            <button type="button" className="sidebar-user" onClick={() => void logout()} title="Se déconnecter">
              <span className="avatar">{initials(user)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <div className="sidebar-user__name">
                  {user.firstName} {user.lastName}
                </div>
                <div className="sidebar-user__role">{USER_ROLE_LABELS_FR[user.role]}</div>
              </span>
              <IconLogOut style={{ width: 15, height: 15, color: "var(--sidebar-text)" }} />
            </button>
          </div>
        )}
      </nav>
      <div className="main-column">
        <header className="topbar">
          <span className="topbar-title">{pageTitle(location.pathname)}</span>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
