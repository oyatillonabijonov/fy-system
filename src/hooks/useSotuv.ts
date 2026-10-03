import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getPipelines, getStages, getLeads, getLead, createLead, updateLead, deleteLead,
  getNotes, getLeadCalls, getCalls, getDuplicateLeads, mergeLeads, renameClient, addNote, deleteNote, getLeadTasks, getOpenTasks, addTask, updateTask, deleteTask,
  createPipeline, renamePipeline, setPipelineEvent, deletePipeline, saveStage, deleteStage,
  type CallFilter, type Lead, type LeadDraft, type LeadPatch, type TaskDraft, type Stage,
} from "@/lib/supabase/queries/sotuv"

/** Every Sotuv query key starts with this — one invalidation refreshes the section */
export const SOTUV_KEY = ["sotuv"] as const
const K = {
  pipelines: [...SOTUV_KEY, "pipelines"],
  stages: (p: string | null) => [...SOTUV_KEY, "stages", p],
  leads: (p: string | null) => [...SOTUV_KEY, "leads", p],
  lead: (id: string) => [...SOTUV_KEY, "lead", id],
  notes: (id: string) => [...SOTUV_KEY, "notes", id],
  tasks: (id: string) => [...SOTUV_KEY, "tasks", id],
  openTasks: [...SOTUV_KEY, "open-tasks"],
}

export const usePipelines = () => useQuery({ queryKey: K.pipelines, queryFn: getPipelines })
export const useStages = (p: string | null) => useQuery({ queryKey: K.stages(p), queryFn: () => getStages(p!), enabled: !!p })
export const useLeads = (p: string | null) => useQuery({ queryKey: K.leads(p), queryFn: () => getLeads(p!), enabled: !!p, refetchOnMount: true })
export const useLead = (id: string) => useQuery({ queryKey: K.lead(id), queryFn: () => getLead(id), refetchOnMount: true })
export const useNotes = (id: string) => useQuery({ queryKey: K.notes(id), queryFn: () => getNotes(id) })
export const useLeadTasks = (id: string) => useQuery({ queryKey: K.tasks(id), queryFn: () => getLeadTasks(id) })
export const useLeadCalls = (id: string) => useQuery({ queryKey: [...SOTUV_KEY, "calls", id], queryFn: () => getLeadCalls(id), refetchOnMount: true })
export const useCalls = (o: { page: number; filter: CallFilter; staffId: string | null }) =>
  useQuery({ queryKey: [...SOTUV_KEY, "calls-page", o], queryFn: () => getCalls(o), refetchOnMount: true, placeholderData: (prev) => prev })
export const useDuplicateLeads = () => useQuery({ queryKey: [...SOTUV_KEY, "duplicates"], queryFn: getDuplicateLeads, refetchOnMount: true })
export const useMergeLeads = () => useSotuvMutation(({ keep, drop }: { keep: string; drop: string }) => mergeLeads(keep, drop), "Bitimlar birlashtirildi")
export const useRenameClient = () => useSotuvMutation(({ id, name }: { id: string; name: string }) => renameClient(id, name), "Mijoz ismi saqlandi")
export const useOpenTasks = () => useQuery({ queryKey: K.openTasks, queryFn: getOpenTasks, refetchOnMount: true })

/** Any Sotuv write → refetch the whole section (small data, always consistent) */
function useSotuvMutation<V, R = void>(fn: (v: V) => Promise<R>, success?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    meta: success ? { success } : undefined,
    onSettled: () => qc.invalidateQueries({ queryKey: SOTUV_KEY }),
  })
}

export const useCreateLead = () => useSotuvMutation((d: LeadDraft) => createLead(d), "Bitim qo'shildi")
export const useDeleteLead = () => useSotuvMutation((id: string) => deleteLead(id), "Bitim o'chirildi")
export const useAddNote = () => useSotuvMutation(({ leadId, text }: { leadId: string; text: string }) => addNote(leadId, text))
export const useDeleteNote = () => useSotuvMutation((id: string) => deleteNote(id))
export const useAddTask = () => useSotuvMutation((t: TaskDraft) => addTask(t), "Vazifa qo'shildi")
export const useDeleteTask = () => useSotuvMutation((id: string) => deleteTask(id))
export const useUpdateTask = () =>
  useSotuvMutation(({ id, patch }: { id: string; patch: Parameters<typeof updateTask>[1] }) => updateTask(id, patch))

export const useCreatePipeline = () => useSotuvMutation(({ name, sortOrder }: { name: string; sortOrder: number }) => createPipeline(name, sortOrder), "Voronka yaratildi")
export const useRenamePipeline = () => useSotuvMutation(({ id, name }: { id: string; name: string }) => renamePipeline(id, name))
export const useSetPipelineEvent = () => useSotuvMutation(({ id, eventId }: { id: string; eventId: string | null }) => setPipelineEvent(id, eventId), "Tadbir biriktirildi")
export const useDeletePipeline = () => useSotuvMutation((id: string) => deletePipeline(id), "Voronka o'chirildi")
export const useSaveStage = () => useSotuvMutation((s: Partial<Stage> & { pipeline_id: string }) => saveStage(s))
export const useDeleteStage = () => useSotuvMutation((id: string) => deleteStage(id))

/** Edit a deal; the board card moves at once (optimistic), rolled back on failure */
export function useUpdateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LeadPatch }) => updateLead(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: SOTUV_KEY })
      const boards = qc.getQueriesData<Lead[]>({ queryKey: [...SOTUV_KEY, "leads"] })
      const one = qc.getQueryData<Lead | null>(K.lead(id))
      for (const [key, rows] of boards) qc.setQueryData(key, rows?.map((l) => (l.id === id ? { ...l, ...patch } : l)))
      if (one) qc.setQueryData(K.lead(id), { ...one, ...patch })
      return { boards, one }
    },
    onError: (_e, { id }, ctx) => {
      for (const [key, rows] of ctx?.boards ?? []) qc.setQueryData(key, rows)
      if (ctx?.one) qc.setQueryData(K.lead(id), ctx.one)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: SOTUV_KEY }),
  })
}
