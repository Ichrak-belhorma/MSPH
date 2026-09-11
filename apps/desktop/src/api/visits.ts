import type {
  AddVisitPhotoInput,
  Case,
  CompleteVisitInput,
  Customer,
  Inspection,
  Paginated,
  Photo,
  Property,
  RecordInspectionInput,
  ScheduleVisitInput,
  StartVisitInput,
  UpdateVisitInput,
  User,
  Visit,
  VisitListQuery,
} from "@msph/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, toQueryString } from "../lib/apiClient.js";
import { queryKeys } from "./queryKeys.js";

/** Full shape returned by the visit endpoints — see
 * apps/server/src/modules/visits/visits.service.ts's `visitInclude`. */
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

export function scheduleVisit(input: ScheduleVisitInput): Promise<VisitDetail> {
  return apiClient.post<VisitDetail>("/visits", input);
}

export function updateVisit(id: string, input: UpdateVisitInput): Promise<VisitDetail> {
  return apiClient.patch<VisitDetail>(`/visits/${id}`, input);
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

export function addVisitPhoto(id: string, input: AddVisitPhotoInput): Promise<Photo> {
  return apiClient.post<Photo>(`/visits/${id}/photos`, input);
}

// --- react-query hooks ------------------------------------------------

export function useVisitsQuery(params: VisitListParams = {}) {
  return useQuery({ queryKey: queryKeys.visits.list(params), queryFn: () => listVisits(params) });
}

export function useVisitQuery(id: string | undefined) {
  return useQuery({ queryKey: queryKeys.visits.detail(id ?? ""), queryFn: () => getVisit(id!), enabled: !!id });
}

function useInvalidateVisits(caseId?: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.visits.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.cases.all() });
    if (caseId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.timeline(caseId) });
    }
  };
}

export function useScheduleVisitMutation(caseId?: string) {
  const invalidate = useInvalidateVisits(caseId);
  return useMutation({ mutationFn: scheduleVisit, onSuccess: invalidate });
}

export function useUpdateVisitMutation(caseId?: string) {
  const invalidate = useInvalidateVisits(caseId);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateVisitInput }) => updateVisit(id, input),
    onSuccess: invalidate,
  });
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
