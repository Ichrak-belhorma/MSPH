import type { ChangePasswordInput, LoginInput, LoginResponse, User } from "@msph/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "../lib/apiClient.js";
import { queryKeys } from "./queryKeys.js";

export function login(input: LoginInput): Promise<LoginResponse> {
  return apiClient.raw<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify(input) });
}

export function logout(refreshToken: string): Promise<void> {
  return apiClient.raw<void>("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });
}

export function changePassword(input: ChangePasswordInput): Promise<void> {
  return apiClient.post<void>("/auth/change-password", input);
}

export function getMe(): Promise<User> {
  return apiClient.get<User>("/me");
}

export function useMeQuery(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.me(), queryFn: getMe, enabled });
}

export function useChangePasswordMutation() {
  return useMutation({ mutationFn: changePassword });
}
