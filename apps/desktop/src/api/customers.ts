import type { CreateCustomerInput, Customer, Paginated, PeopleListQuery, UpdateCustomerInput } from "@msph/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, toQueryString } from "../lib/apiClient.js";
import { queryKeys } from "./queryKeys.js";

export type PeopleListParams = Partial<PeopleListQuery>;

export function listCustomers(params: PeopleListParams = {}): Promise<Paginated<Customer>> {
  return apiClient.get<Paginated<Customer>>(`/customers${toQueryString(params)}`);
}

export function getCustomer(id: string): Promise<Customer> {
  return apiClient.get<Customer>(`/customers/${id}`);
}

export function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  return apiClient.post<Customer>("/customers", input);
}

export function updateCustomer(id: string, input: UpdateCustomerInput): Promise<Customer> {
  return apiClient.patch<Customer>(`/customers/${id}`, input);
}

export function useCustomersQuery(params: PeopleListParams = {}) {
  return useQuery({ queryKey: queryKeys.customers.list(params), queryFn: () => listCustomers(params) });
}

export function useCreateCustomerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCustomer,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useUpdateCustomerMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCustomerInput }) => updateCustomer(id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["customers"] }),
  });
}
