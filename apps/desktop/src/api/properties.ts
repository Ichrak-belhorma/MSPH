import type { CreatePropertyInput, Landlord, Paginated, Property, UpdatePropertyInput } from "@msph/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, toQueryString } from "../lib/apiClient.js";
import { queryKeys } from "./queryKeys.js";
import type { PeopleListParams } from "./customers.js";

export type PropertyWithLandlord = Property & { landlord: Landlord | null };

export function listProperties(params: PeopleListParams = {}): Promise<Paginated<PropertyWithLandlord>> {
  return apiClient.get<Paginated<PropertyWithLandlord>>(`/properties${toQueryString(params)}`);
}

export function getProperty(id: string): Promise<PropertyWithLandlord> {
  return apiClient.get<PropertyWithLandlord>(`/properties/${id}`);
}

export function createProperty(input: CreatePropertyInput): Promise<PropertyWithLandlord> {
  return apiClient.post<PropertyWithLandlord>("/properties", input);
}

export function updateProperty(id: string, input: UpdatePropertyInput): Promise<PropertyWithLandlord> {
  return apiClient.patch<PropertyWithLandlord>(`/properties/${id}`, input);
}

export function useProperties(params: PeopleListParams = {}) {
  return useQuery({ queryKey: queryKeys.properties.list(params), queryFn: () => listProperties(params) });
}

export function useCreatePropertyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProperty,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["properties"] }),
  });
}

export function useUpdatePropertyMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePropertyInput }) => updateProperty(id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["properties"] }),
  });
}
