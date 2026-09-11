import type { CreateTreatmentInput, Paginated, Treatment, TreatmentListQuery, UpdateTreatmentInput } from "@msph/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, toQueryString } from "../lib/apiClient.js";
import { queryKeys } from "./queryKeys.js";

export type TreatmentListParams = Partial<TreatmentListQuery>;

export function listTreatments(params: TreatmentListParams = {}): Promise<Paginated<Treatment>> {
  return apiClient.get<Paginated<Treatment>>(`/treatments${toQueryString(params)}`);
}

export function createTreatment(input: CreateTreatmentInput): Promise<Treatment> {
  return apiClient.post<Treatment>("/treatments", input);
}

export function updateTreatment(id: string, input: UpdateTreatmentInput): Promise<Treatment> {
  return apiClient.patch<Treatment>(`/treatments/${id}`, input);
}

export function useTreatmentsQuery(params: TreatmentListParams = {}) {
  return useQuery({ queryKey: queryKeys.treatments.list(params), queryFn: () => listTreatments(params) });
}

export function useCreateTreatmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createTreatment,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["treatments"] }),
  });
}

export function useUpdateTreatmentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTreatmentInput }) => updateTreatment(id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["treatments"] }),
  });
}
