import type { CreateLandlordInput, Landlord, Paginated } from "@msph/shared";
import { useQuery } from "@tanstack/react-query";
import { apiClient, toQueryString } from "../lib/apiClient.js";
import { queryKeys } from "./queryKeys.js";
import type { PeopleListParams } from "./customers.js";

/**
 * No dedicated "Landlords" page (the desktop nav only asked for
 * Dashboard/Cases/Calendar/Customers/Properties/Treatments/Workers/
 * Settings — see CONTEXT.md) — landlords are managed inline wherever a
 * property needs one: a search-as-you-type picker against this list, or
 * a quick create when the manager is entering a brand-new landlord. The
 * `/landlords` API from session 2 is otherwise unused by any standalone
 * screen this session.
 */
export function listLandlords(params: PeopleListParams = {}): Promise<Paginated<Landlord>> {
  return apiClient.get<Paginated<Landlord>>(`/landlords${toQueryString(params)}`);
}

export function createLandlord(input: CreateLandlordInput): Promise<Landlord> {
  return apiClient.post<Landlord>("/landlords", input);
}

export function useLandlordsQuery(params: PeopleListParams = {}) {
  return useQuery({ queryKey: queryKeys.landlords.list(params), queryFn: () => listLandlords(params) });
}
