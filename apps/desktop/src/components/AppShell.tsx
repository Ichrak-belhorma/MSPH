import { NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/cases", label: "Cases" },
  { to: "/calendar", label: "Calendar" },
  { to: "/customers", label: "Customers" },
  { to: "/properties", label: "Properties" },
  { to: "/landlords", label: "Landlords" },
  { to: "/workers", label: "Workers" },
  { to: "/treatments", label: "Treatments" },
  { to: "/settings", label: "Settings" },
] as const;

export function AppShell() {
  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-brand">MSPH</div>
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={"end" in item ? item.end : false}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
