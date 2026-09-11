import type { CreateUserInput, Paginated, UpdateUserInput, User, UserListQuery } from "@msph/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, toQueryString } from "../lib/apiClient.js";
import { queryKeys } from "./queryKeys.js";

export type UserListParams = Partial<UserListQuery>;

export function listUsers(params: UserListParams = {}): Promise<Paginated<User>> {
  return apiClient.get<Paginated<User>>(`/users${toQueryString(params)}`);
}

export function createUser(input: CreateUserInput): Promise<User> {
  return apiClient.post<User>("/users", input);
}

export function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  return apiClient.patch<User>(`/users/${id}`, input);
}

export function useUsersQuery(params: UserListParams = {}) {
  return useQuery({ queryKey: queryKeys.users.list(params), queryFn: () => listUsers(params) });
}

/** Workers only, for assignment pickers (schedule visit, new case). Kept
 * as a thin wrapper so call sites read intent, not implementation. */
export function useWorkersQuery() {
  return useUsersQuery({ role: "WORKER", active: true, pageSize: 100 });
}

export function useCreateUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createUser,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) => updateUser(id, input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users"] }),
  });
}
