import { format, formatDistanceToNow, isToday as fnsIsToday } from "date-fns";
import { fr } from "date-fns/locale";
import type { User } from "@msph/shared";

export function fullName(person: Pick<User, "firstName" | "lastName">): string {
  return `${person.firstName} ${person.lastName}`;
}

/** "14:30" — the only thing a worker glancing at a visit card needs. */
export function formatTime(iso: string): string {
  return format(new Date(iso), "HH:mm");
}

/** "12 mars" — no year, this app never shows anything far enough out to need one. */
export function formatDayMonth(iso: string): string {
  return format(new Date(iso), "d MMMM", { locale: fr });
}

/** "12 mars à 14:30" */
export function formatDateTime(iso: string): string {
  return format(new Date(iso), "d MMMM 'à' HH:mm", { locale: fr });
}

export function isToday(iso: string): boolean {
  return fnsIsToday(new Date(iso));
}

/** "il y a 3 heures" / "dans 2 jours" — used for the odd relative note,
 * not as the primary time display (workers want an exact time, not a
 * fuzzy one, per the mobile UX principle). */
export function formatRelative(iso: string): string {
  return formatDistanceToNow(new Date(iso), { locale: fr, addSuffix: true });
}
