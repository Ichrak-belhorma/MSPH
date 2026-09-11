import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.js";

/**
 * Wraps every authenticated route (everything except /login). Also
 * catches the "session expired mid-session" case: `apiClient`'s 401
 * refresh-and-retry clears the auth store on a dead refresh token (see
 * `SessionExpiredError` in lib/apiClient.ts), which flips
 * `isAuthenticated` to false — the next render redirects here
 * automatically, no manual event wiring needed.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { initializing, isAuthenticated } = useAuth();
  const location = useLocation();

  if (initializing) {
    return (
      <div className="boot-screen">
        <div className="boot-screen__mark">MSPH</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/connexion" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
