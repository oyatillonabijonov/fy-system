import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getAllUsers,
  getUserById,
  getUserStats,
  getDepartmentStats,
  createUser,
  updateUserPermissions,
  updateUserRole,
  updateUserProfile,
  deactivateUser,
  activateUser,
  getUserPermissions,
  type ModuleName,
  type UserRole,
  type UserProfile,
  type UserPermission,
  type UserStats,
  type DepartmentStats,
} from "@/lib/supabase/queries/auth"

export const USERS_KEY = ["users"] as const
export const USER_PERMISSIONS_KEY = ["user-permissions"] as const
export const DEPARTMENT_STATS_KEY = ["department-stats"] as const

export function useDepartmentStats() {
  return useQuery<DepartmentStats[]>({
    queryKey: DEPARTMENT_STATS_KEY,
    queryFn: getDepartmentStats,
    staleTime: 1000 * 60 * 2,
  })
}

export function useUsers() {
  return useQuery<UserProfile[]>({
    queryKey: USERS_KEY,
    queryFn: getAllUsers,
    staleTime: 1000 * 60 * 2,
  })
}

export function useUser(userId: string | null | undefined) {
  return useQuery<UserProfile | null>({
    queryKey: [...USERS_KEY, userId],
    queryFn: () => getUserById(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60,
  })
}

export function useUserStats(userId: string | null | undefined) {
  return useQuery<UserStats>({
    queryKey: [...USERS_KEY, userId, "stats"],
    queryFn: () => getUserStats(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60 * 2,
  })
}

export function useUserPermissions(userId: string | null | undefined) {
  return useQuery<UserPermission[]>({
    queryKey: [...USER_PERMISSIONS_KEY, userId],
    queryFn: () => getUserPermissions(userId!),
    enabled: !!userId,
    staleTime: 1000 * 60,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof createUser>[0]) => createUser(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  })
}

export function useUpdateUserProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { userId: string; data: Partial<UserProfile> }) =>
      updateUserProfile(vars.userId, vars.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: USERS_KEY })
      qc.invalidateQueries({ queryKey: [...USERS_KEY, vars.userId] })
    },
  })
}

export function useUpdateUserPermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { userId: string; modules: ModuleName[] }) =>
      updateUserPermissions(vars.userId, vars.modules),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: USERS_KEY })
      qc.invalidateQueries({ queryKey: [...USER_PERMISSIONS_KEY, vars.userId] })
    },
  })
}

export function useUpdateUserRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { userId: string; role: UserRole }) =>
      updateUserRole(vars.userId, vars.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  })
}

export function useDeactivateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => deactivateUser(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  })
}

export function useActivateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => activateUser(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: USERS_KEY }),
  })
}
