import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { SOTUV_KEY } from "@/hooks/useSotuv"
import { getCallAnalysis, getCallStats, getSalesScript, requeueCallAnalysis, saveSalesScript } from "@/lib/supabase/queries/callAnalysis"

// Under SOTUV_KEY: LiveSync refetches them when amo-sync writes an analysis
export const useCallAnalysis = (uuid: string | null) =>
  useQuery({ queryKey: [...SOTUV_KEY, "call-analysis", uuid], queryFn: () => getCallAnalysis(uuid!), enabled: !!uuid, refetchOnMount: true })

export const useCallStats = (from: string, to: string) =>
  useQuery({ queryKey: [...SOTUV_KEY, "call-stats", from, to], queryFn: () => getCallStats(from, to), refetchOnMount: true })

export const useSalesScript = () => useQuery({ queryKey: [...SOTUV_KEY, "sales-script"], queryFn: getSalesScript, refetchOnMount: true })

export function useSaveSalesScript() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ body, userId }: { body: string; userId: string | null }) => saveSalesScript(body, userId),
    meta: { success: "Skript saqlandi" },
    onSettled: () => qc.invalidateQueries({ queryKey: [...SOTUV_KEY, "sales-script"] }),
  })
}

export function useRequeueAnalysis() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: requeueCallAnalysis,
    meta: { success: "Qayta tahlilga yuborildi" },
    onSettled: () => qc.invalidateQueries({ queryKey: SOTUV_KEY }),
  })
}
