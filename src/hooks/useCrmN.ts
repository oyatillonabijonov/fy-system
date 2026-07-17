import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getCrmPipelines,
  getCrmStages,
  getCrmLeads,
  updateCrmLeadStage,
  getCrmUsers,
  type CrmPipeline,
  type CrmStage,
  type CrmLeadWithContact,
  type CrmUser,
} from "@/lib/supabase/queries/crm"

export const CRM_PIPELINES_KEY = ["crm-pipelines"] as const
export const CRM_STAGES_KEY = ["crm-stages"] as const
export const CRM_LEADS_KEY = ["crm-leads"] as const
export const CRM_USERS_KEY = ["crm-users"] as const

export function useCrmPipelines() {
  return useQuery<CrmPipeline[]>({
    queryKey: CRM_PIPELINES_KEY,
    queryFn: getCrmPipelines,
    staleTime: 1000 * 60 * 10,
  })
}

export function useCrmUsers() {
  return useQuery<CrmUser[]>({
    queryKey: CRM_USERS_KEY,
    queryFn: getCrmUsers,
    staleTime: 1000 * 60 * 10,
  })
}

export function useCrmStages(pipelineId: string | null) {
  return useQuery<CrmStage[]>({
    queryKey: [...CRM_STAGES_KEY, pipelineId],
    queryFn: () => getCrmStages(pipelineId!),
    staleTime: 1000 * 60 * 5,
    enabled: !!pipelineId,
  })
}

export function useCrmLeads(pipelineId: string | null) {
  return useQuery<CrmLeadWithContact[]>({
    queryKey: [...CRM_LEADS_KEY, pipelineId],
    queryFn: () => getCrmLeads(pipelineId!),
    staleTime: 1000 * 60 * 2,
    enabled: !!pipelineId,
  })
}

export function useUpdateCrmLeadStage(pipelineId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: string; stageId: string }) =>
      updateCrmLeadStage(leadId, stageId),
    onMutate: async ({ leadId, stageId }) => {
      const key = [...CRM_LEADS_KEY, pipelineId]
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<CrmLeadWithContact[]>(key)
      qc.setQueryData<CrmLeadWithContact[]>(key, (old) =>
        old?.map((l) => (l.id === leadId ? { ...l, stage_id: stageId } : l))
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        qc.setQueryData([...CRM_LEADS_KEY, pipelineId], context.previous)
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [...CRM_LEADS_KEY, pipelineId] })
    },
  })
}
