import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient.js";
import { AuthProvider, useAuth } from "./auth/AuthContext.js";
import { RequireAuth } from "./auth/RequireAuth.js";
import { RealtimeProvider } from "./realtime/RealtimeProvider.js";
import { ToastProvider } from "./components/ToastProvider.js";
import { AppShell } from "./components/AppShell.js";
import { LoginPage } from "./pages/LoginPage.js";
import { DashboardPage } from "./pages/DashboardPage.js";
import { CasesListPage } from "./pages/cases/CasesListPage.js";
import { CaseNewPage } from "./pages/cases/CaseNewPage.js";
import { CaseDetailPage } from "./pages/cases/CaseDetailPage.js";
import { CalendarPage } from "./pages/calendar/CalendarPage.js";
import { CustomersPage } from "./pages/customers/CustomersPage.js";
import { PropertiesPage } from "./pages/properties/PropertiesPage.js";
import { TreatmentsPage } from "./pages/treatments/TreatmentsPage.js";
import { WorkersPage } from "./pages/workers/WorkersPage.js";
import { SettingsPage } from "./pages/settings/SettingsPage.js";

/** Sends an already-logged-in user straight past /connexion instead of
 * showing them the login form again. */
function LoginRoute() {
  const { isAuthenticated, initializing } = useAuth();
  if (!initializing && isAuthenticated) return <Navigate to="/" replace />;
  return <LoginPage />;
}

// HashRouter, not BrowserRouter: the production build is loaded from
// file:// inside Electron, where a history-based router can't resolve
// nested paths.
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <HashRouter>
          <AuthProvider>
            <RealtimeProvider>
              <Routes>
                <Route path="/connexion" element={<LoginRoute />} />
                <Route
                  element={
                    <RequireAuth>
                      <AppShell />
                    </RequireAuth>
                  }
                >
                  <Route index element={<DashboardPage />} />
                  <Route path="dossiers" element={<CasesListPage />} />
                  <Route path="dossiers/nouveau" element={<CaseNewPage />} />
                  <Route path="dossiers/:caseId" element={<CaseDetailPage />} />
                  <Route path="calendrier" element={<CalendarPage />} />
                  <Route path="clients" element={<CustomersPage />} />
                  <Route path="proprietes" element={<PropertiesPage />} />
                  <Route path="traitements" element={<TreatmentsPage />} />
                  <Route path="intervenants" element={<WorkersPage />} />
                  <Route path="parametres" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </RealtimeProvider>
          </AuthProvider>
        </HashRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
