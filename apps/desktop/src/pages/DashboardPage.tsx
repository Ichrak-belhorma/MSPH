import { useEffect, useState } from "react";
import { CASE_STATUS_LABELS, CaseStatus } from "@msph/shared";
import { api, ApiRequestError } from "../lib/api.js";

type ConnectionState =
  | { kind: "loading" }
  | { kind: "connected"; database: "connected" | "disconnected" }
  | { kind: "error"; message: string };

/** The dashboard's job (per the product brief) is to answer at a glance:
 * what's new, what's scheduled, what's upcoming, what's waiting on
 * follow-up, what's resolved. The buckets below are the real case-status
 * lifecycle; "upcoming interventions" and "waiting for follow-up" will be
 * populated from Visit queries once the cases API exists (see
 * CONTEXT.md "Next steps") rather than from Case.status alone. */
const DASHBOARD_BUCKETS: { status: CaseStatus; hint: string }[] = [
  { status: CaseStatus.NEW, hint: "Just came in, nothing scheduled yet" },
  { status: CaseStatus.SCHEDULED, hint: "Next visit is on the calendar" },
  { status: CaseStatus.IN_PROGRESS, hint: "Inspection/treatment underway" },
  { status: CaseStatus.RESOLVED, hint: "Problem confirmed resolved" },
];

export function DashboardPage() {
  const [connection, setConnection] = useState<ConnectionState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((res) => {
        if (!cancelled) setConnection({ kind: "connected", database: res.database });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof ApiRequestError ? err.message : "Cannot reach the API server";
        setConnection({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <p className="muted">At-a-glance view of every case in the system.</p>

      <div className={`status-banner status-banner--${connection.kind}`}>
        {connection.kind === "loading" && "Checking connection to server…"}
        {connection.kind === "connected" &&
          `Connected to server — database ${connection.database}.`}
        {connection.kind === "error" && `Server unreachable: ${connection.message}`}
      </div>

      <div className="bucket-grid">
        {DASHBOARD_BUCKETS.map((bucket) => (
          <div key={bucket.status} className="bucket-card">
            <h2>{CASE_STATUS_LABELS[bucket.status]}</h2>
            <p className="muted">{bucket.hint}</p>
            <div className="bucket-count">—</div>
          </div>
        ))}
      </div>

      <p className="muted" style={{ marginTop: 24 }}>
        Case data will populate here once the Cases API is implemented (see CONTEXT.md).
      </p>
    </div>
  );
}
