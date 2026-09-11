import type {
  CaseActivity,
  CaseListQuery,
  CasePriority,
  CaseStatus,
  CaseTreatment,
  CaseWithRelations,
  Customer,
  CreateCaseInput,
  AssignTreatmentToCaseInput,
  Paginated,
  Property,
  Treatment,
  UpdateCaseInput,
  UpdateCaseTreatmentInput,
} from "@msph/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, toQueryString } from "../lib/apiClient.js";
import { queryKeys } from "./queryKeys.js";

/** Shape of one row in GET /cases — the server includes customer +
 * property (no landlord, no visits) for the list view; full detail only
 * loads on GET /cases/:id. Kept local since it's a list-endpoint-specific
 * projection, not a core domain shape (see CONTEXT.md's note on
 * service-layer vs. wire types for why the server doesn't export this
 * from @msph/shared either). */
export interface CaseListItem {
  id: string;
  customerId: string;
  propertyId: string;
  problemDescription: string;
  status: CaseStatus;
  priority: CasePriority;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  customer: Customer;
  property: Property;
}

export type CaseTreatmentWithTreatment = CaseTreatment & { treatment: Treatment };

/** One entry of `CaseWithRelations.visits` — narrower than the full
 * `VisitDetail` shape from api/visits.ts (no `.case`, since we're already
 * inside that case's own detail page when this type is used). Modals that
 * only need visit-level fields (EditVisitModal, CompleteVisitModal) accept
 * this instead of the wider type so they work from both the case detail
 * page and anywhere else a full VisitDetail happens to be on hand (a
 * VisitDetail structurally satisfies this narrower shape too). */
export type CaseVisit = CaseWithRelations["visits"][number];

export type CaseListParams = Partial<CaseListQuery>;

export function listCases(params: CaseListParams = {}): Promise<Paginated<CaseListItem>> {
  return apiClient.get<Paginated<CaseListItem>>(`/cases${toQueryString(params)}`);
}

export function getCase(id: string): Promise<CaseWithRelations> {
  return apiClient.get<CaseWithRelations>(`/cases/${id}`);
}

export function getCaseTimeline(id: string): Promise<CaseActivity[]> {
  return apiClient.get<CaseActivity[]>(`/cases/${id}/timeline`);
}

export function createCase(input: CreateCaseInput): Promise<CaseWithRelations> {
  return apiClient.post<CaseWithRelations>("/cases", input);
}

export function updateCase(id: string, input: UpdateCaseInput): Promise<CaseWithRelations> {
  return apiClient.patch<CaseWithRelations>(`/cases/${id}`, input);
}

export function addTreatmentToCase(caseId: string, input: AssignTreatmentToCaseInput): Promise<CaseTreatmentWithTreatment> {
  return apiClient.post<CaseTreatmentWithTreatment>(`/cases/${caseId}/treatments`, input);
}

export function updateCaseTreatment(
  caseId: string,
  caseTreatmentId: string,
  input: UpdateCaseTreatmentInput,
): Promise<CaseTreatmentWithTreatment> {
  return apiClient.patch<CaseTreatmentWithTreatment>(`/cases/${caseId}/treatments/${caseTreatmentId}`, input);
}

export function removeCaseTreatment(caseId: string, caseTreatmentId: string): Promise<void> {
  return apiClient.delete<void>(`/cases/${caseId}/treatments/${caseTreatmentId}`);
}

// --- react-query hooks ------------------------------------------------

export function useCasesQuery(params: CaseListParams = {}) {
  return useQuery({ queryKey: queryKeys.cases.list(params), queryFn: () => listCases(params) });
}

export function useCaseQuery(id: string | undefined) {
  return useQuery({ queryKey: queryKeys.cases.detail(id ?? ""), queryFn: () => getCase(id!), enabled: !!id });
}

export function useCaseTimelineQuery(id: string | undefined) {
  return useQuery({ queryKey: queryKeys.cases.timeline(id ?? ""), queryFn: () => getCaseTimeline(id!), enabled: !!id });
}

function useInvalidateCase(caseId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.cases.timeline(caseId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.cases.all() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.visits.all() });
  };
}

export function useCreateCaseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCase,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.all() });
    },
  });
}

export function useUpdateCaseMutation(caseId: string) {
  const invalidate = useInvalidateCase(caseId);
  return useMutation({
    mutationFn: (input: UpdateCaseInput) => updateCase(caseId, input),
    onSuccess: invalidate,
  });
}

export function useAddTreatmentMutation(caseId: string) {
  const invalidate = useInvalidateCase(caseId);
  return useMutation({
    mutationFn: (input: AssignTreatmentToCaseInput) => addTreatmentToCase(caseId, input),
    onSuccess: invalidate,
  });
}

export function useUpdateCaseTreatmentMutation(caseId: string) {
  const invalidate = useInvalidateCase(caseId);
  return useMutation({
    mutationFn: ({ caseTreatmentId, input }: { caseTreatmentId: string; input: UpdateCaseTreatmentInput }) =>
      updateCaseTreatment(caseId, caseTreatmentId, input),
    onSuccess: invalidate,
  });
}

export function useRemoveCaseTreatmentMutation(caseId: string) {
  const invalidate = useInvalidateCase(caseId);
  return useMutation({
    mutationFn: (caseTreatmentId: string) => removeCaseTreatment(caseId, caseTreatmentId),
    onSuccess: invalidate,
  });
}
