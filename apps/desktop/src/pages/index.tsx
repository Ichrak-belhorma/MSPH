export { DashboardPage } from "./DashboardPage.js";
import { PagePlaceholder } from "../components/PagePlaceholder.js";

export function CasesPage() {
  return (
    <PagePlaceholder
      title="Cases"
      description="List every case with status, priority and next scheduled visit. Case detail will show the full timeline: request received → consultation scheduled → inspection → treatment(s) → follow-up → resolution."
    />
  );
}

export function CalendarPage() {
  return (
    <PagePlaceholder
      title="Calendar"
      description="Week/month view of every scheduled visit across all workers, for planning consultations and interventions."
    />
  );
}

export function CustomersPage() {
  return <PagePlaceholder title="Customers" description="Manage customer contact records." />;
}

export function PropertiesPage() {
  return <PagePlaceholder title="Properties" description="Manage property records and their linked landlord." />;
}

export function LandlordsPage() {
  return <PagePlaceholder title="Landlords" description="Manage landlord/owner contact records." />;
}

export function WorkersPage() {
  return <PagePlaceholder title="Workers" description="Manage worker accounts and view their assigned visits." />;
}

export function TreatmentsPage() {
  return (
    <PagePlaceholder
      title="Treatments"
      description="Manage the treatment/procedure catalog: name, description, instructions, duration, safety information."
    />
  );
}

export function SettingsPage() {
  return <PagePlaceholder title="Settings" description="Application and account settings." />;
}
