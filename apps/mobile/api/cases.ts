import type { CaseWithRelations, UpdateCaseTreatmentInput } from "@msph/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient";
import { queryKeys } from "./queryKeys";

/**
 * A worker only reads case detail here — never creates/edits a case, adds
 * treatments, or resolves it (admin-only, per CONTEXT.md "Authorization
 * model"). The one write this module exposes, updateCaseTreatment, is the
 * one thing the backend explicitly allows a worker to do: record that an
 * already-chosen treatment was performed (see apps/server/src/modules/
 * cases/case-treatments.service.ts's doc comment on updateCaseTreatment).
 * `assertCaseAccess` on the server is what actually enforces "only a case
 * you have an assigned visit on" — this module doesn't re-implement that,
 * it just calls the same endpoint the desktop uses and lets the 403 speak
 * for itself if it's ever reached in error.
 */
export function getCase(id: string): Promise<CaseWithRelations> {
  return apiClient.get<CaseWithRelations>(`/cases/${id}`);
}

export function updateCaseTreatment(caseId: string, caseTreatmentId: string, input: UpdateCaseTreatmentInput) {
  return apiClient.patch(`/cases/${caseId}/treatments/${caseTreatmentId}`, input);
}

export function useCaseQuery(id: string | undefined) {
  return useQuery({ queryKey: queryKeys.cases.detail(id ?? ""), queryFn: () => getCase(id!), enabled: !!id });
}

export function useUpdateCaseTreatmentMutation(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caseTreatmentId, input }: { caseTreatmentId: string; input: UpdateCaseTreatmentInput }) =>
      updateCaseTreatment(caseId, caseTreatmentId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId) });
    },
  });
}
