import { HashRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell.js";
import {
  CalendarPage,
  CasesPage,
  CustomersPage,
  DashboardPage,
  LandlordsPage,
  PropertiesPage,
  SettingsPage,
  TreatmentsPage,
  WorkersPage,
} from "./pages/index.js";

// HashRouter, not BrowserRouter: the production build is loaded from
// file:// inside Electron, where a history-based router can't resolve
// nested paths.
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="cases" element={<CasesPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="properties" element={<PropertiesPage />} />
          <Route path="landlords" element={<LandlordsPage />} />
          <Route path="workers" element={<WorkersPage />} />
          <Route path="treatments" element={<TreatmentsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
