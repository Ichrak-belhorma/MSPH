import { fr } from "date-fns/locale";
import { format, formatDistanceToNow, isToday, isTomorrow, isYesterday } from "date-fns";

/** Every date leaving the API is an ISO string (see @msph/shared's
 * `entities.ts` doc comment) — these all accept that directly. */

export function formatDate(iso: string): string {
  return format(new Date(iso), "d MMMM yyyy", { locale: fr });
}

export function formatDateShort(iso: string): string {
  return format(new Date(iso), "d MMM yyyy", { locale: fr });
}

export function formatTime(iso: string): string {
  return format(new Date(iso), "HH:mm", { locale: fr });
}

export function formatDateTime(iso: string): string {
  return format(new Date(iso), "d MMM yyyy 'à' HH:mm", { locale: fr });
}

/** "Aujourd'hui à 14:30", "Demain à 09:00", "Hier à 16:00", or a full
 * date for anything further out — used wherever a visit/event date needs
 * to read naturally rather than as a raw timestamp. */
export function formatRelativeDay(iso: string): string {
  const date = new Date(iso);
  const time = format(date, "HH:mm", { locale: fr });
  if (isToday(date)) return `Aujourd'hui à ${time}`;
  if (isTomorrow(date)) return `Demain à ${time}`;
  if (isYesterday(date)) return `Hier à ${time}`;
  return formatDateTime(iso);
}

export function formatTimeAgo(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: fr });
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

export function initials(person: { firstName: string; lastName: string }): string {
  return `${person.firstName.charAt(0)}${person.lastName.charAt(0)}`.toUpperCase();
}
