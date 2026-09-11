import type {
  Case,
  CompleteVisitInput,
  Customer,
  Inspection,
  Paginated,
  Property,
  RecordInspectionInput,
  StartVisitInput,
  User,
  Visit,
  VisitListQuery,
} from "@msph/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, toQueryString } from "../lib/apiClient";
import { queryKeys } from "./queryKeys";

/** Full shape returned by the visit endpoints — see
 * apps/server/src/modules/visits/visits.service.ts's `visitInclude`.
 * Same shape as the desktop's VisitDetail (apps/desktop/src/api/visits.ts). */
export interface VisitDetail extends Visit {
  case: Case & { customer: Customer; property: Property };
  assignedWorker: Pick<User, "id" | "firstName" | "lastName"> | null;
  inspection: Inspection | null;
}

export type VisitListParams = Partial<VisitListQuery>;

export function listVisits(params: VisitListParams = {}): Promise<Paginated<VisitDetail>> {
  return apiClient.get<Paginated<VisitDetail>>(`/visits${toQueryString(params)}`);
}

export function getVisit(id: string): Promise<VisitDetail> {
  return apiClient.get<VisitDetail>(`/visits/${id}`);
}

export function startVisit(id: string, input: StartVisitInput = {}): Promise<VisitDetail> {
  return apiClient.post<VisitDetail>(`/visits/${id}/start`, input);
}

export function completeVisit(id: string, input: CompleteVisitInput = {}): Promise<VisitDetail> {
  return apiClient.post<VisitDetail>(`/visits/${id}/complete`, input);
}

export function recordInspection(id: string, input: RecordInspectionInput): Promise<Inspection> {
  return apiClient.post<Inspection>(`/visits/${id}/inspection`, input);
}

// --- react-query hooks ------------------------------------------------

/** The worker's own visits — the server forces `assignedWorkerId` to the
 * caller for non-admins regardless of what's passed here (see
 * apps/server/src/modules/visits/visits.service.ts's listVisits), so this
 * is authoritative, not just a UI filter. */
export function useMyVisitsQuery(params: VisitListParams = {}) {
  return useQuery({ queryKey: queryKeys.visits.list(params), queryFn: () => listVisits(params) });
}

export function useVisitQuery(id: string | undefined) {
  return useQuery({ queryKey: queryKeys.visits.detail(id ?? ""), queryFn: () => getVisit(id!), enabled: !!id });
}

function useInvalidateVisits(caseId?: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.visits.all() });
    if (caseId) void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId) });
  };
}

export function useStartVisitMutation(caseId?: string) {
  const invalidate = useInvalidateVisits(caseId);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input?: StartVisitInput }) => startVisit(id, input),
    onSuccess: invalidate,
  });
}

export function useCompleteVisitMutation(caseId?: string) {
  const invalidate = useInvalidateVisits(caseId);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input?: CompleteVisitInput }) => completeVisit(id, input),
    onSuccess: invalidate,
  });
}

export function useRecordInspectionMutation(caseId?: string) {
  const invalidate = useInvalidateVisits(caseId);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RecordInspectionInput }) => recordInspection(id, input),
    onSuccess: invalidate,
  });
}
