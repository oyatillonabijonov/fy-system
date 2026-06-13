import { useMutation, useQueryClient } from "@tanstack/react-query"
import { updateMyProfile, type UpdateProfileInput } from "@/lib/supabase/queries/profile"
import { useAuth } from "@/context/AuthContext"

export function useUpdateProfile() {
  const qc = useQueryClient()
  const { refreshClient } = useAuth()

  return useMutation({
    mutationFn: (input: UpdateProfileInput) => updateMyProfile(input),
    onSuccess: async () => {
      await refreshClient()
      void qc.invalidateQueries()
    },
  })
}
