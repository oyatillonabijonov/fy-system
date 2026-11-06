import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getEventTasks,
  getTaskProjects,
  createTaskProject,
  deleteTaskProject,
  getTaskCounts,
  getMyTasks,
  createTask,
  updateTask,
  deleteTask,
  copyEventTasks,
  getTaskComments,
  addTaskComment,
  getTaskAttachments,
  addTaskLink,
  addTaskFile,
  deleteTaskAttachment,
  type Task,
  type TaskDraft,
} from "@/lib/supabase/queries/tasks"

export const TASKS_KEY = ["tasks"] as const

/** eventId and projectId null = "Umumiy" tasks */
export function useEventTasks(eventId: string | null, projectId: string | null = null) {
  return useQuery<Task[]>({
    queryKey: [...TASKS_KEY, "event", eventId, projectId],
    queryFn: () => getEventTasks(eventId, projectId),
    refetchOnMount: true,
  })
}

/** The bo'limlar (vazifa turlari) already used in one event / project, or in Umumiy (both null) */
export function useEventSections(eventId: string | null, projectId: string | null = null): string[] {
  const { data = [] } = useEventTasks(eventId, projectId)
  return useMemo(() => [...new Set(data.map((t) => t.section).filter((s): s is string => !!s))], [data])
}

export function useTaskProjects() {
  return useQuery({ queryKey: [...TASKS_KEY, "projects"], queryFn: getTaskProjects })
}

export function useTaskCounts() {
  return useQuery({ queryKey: [...TASKS_KEY, "counts"], queryFn: getTaskCounts, refetchOnMount: true })
}

export function useMyTasks(userId: string | undefined) {
  return useQuery<Task[]>({
    queryKey: [...TASKS_KEY, "mine", userId],
    queryFn: () => getMyTasks(userId!),
    enabled: !!userId,
    refetchOnMount: true,
  })
}

export function useTaskComments(taskId: string | null) {
  return useQuery({
    queryKey: [...TASKS_KEY, "comments", taskId],
    queryFn: () => getTaskComments(taskId!),
    enabled: !!taskId,
  })
}

// silent = the dialog shows the error itself
function useTaskMutation<V>(fn: (v: V) => Promise<unknown>, success?: (data: unknown, vars: unknown) => string | null, silent = false) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: TASKS_KEY }), meta: { success, silent } })
}

export const useCreateTaskProject = () => useTaskMutation((name: string) => createTaskProject(name), () => "Loyiha ochildi", true)
export const useDeleteTaskProject = () => useTaskMutation((id: string) => deleteTaskProject(id), () => "Loyiha o'chirildi")
export const useCreateTask = () => useTaskMutation((d: TaskDraft & { sort_order: number }) => createTask(d), () => "Vazifa qo'shildi", true)
export const useDeleteTask = () => useTaskMutation((id: string) => deleteTask(id), () => "Vazifa o'chirildi", true)
export const useCopyEventTasks = () => useTaskMutation((v: { from: string; to: string }) => copyEventTasks(v.from, v.to), (n) => `${n} ta vazifa ko'chirildi`, true)
export const useTaskAttachments = (taskId: string) =>
  useQuery({ queryKey: [...TASKS_KEY, "attachments", taskId], queryFn: () => getTaskAttachments(taskId), refetchOnMount: true })
export const useAddTaskLink = () => useTaskMutation((v: { taskId: string; url: string; title: string }) => addTaskLink(v.taskId, v.url, v.title), () => "Yo'riqnoma qo'shildi", true)
export const useAddTaskFile = () => useTaskMutation((v: { taskId: string; file: File }) => addTaskFile(v.taskId, v.file), () => "Fayl yuklandi", true)
export const useDeleteTaskAttachment = () => useTaskMutation((id: string) => deleteTaskAttachment(id), () => "Yo'riqnoma o'chirildi")
export const useAddTaskComment = () => useTaskMutation((v: { taskId: string; body: string }) => addTaskComment(v.taskId, v.body), () => "Izoh qo'shildi")

/** Optimistic, so a kanban drop or a status pick moves at once */
export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; patch: Partial<TaskDraft> }) => updateTask(v.id, v.patch),
    // Only the finish line is announced — every inline edit would be noise
    meta: { success: (_d, vars) => ((vars as { patch: Partial<TaskDraft> }).patch.status === "done" ? "Vazifa bajarildi" : null) },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: TASKS_KEY })
      const snapshot = qc.getQueriesData<Task[]>({ queryKey: TASKS_KEY })
      qc.setQueriesData<Task[]>({ queryKey: TASKS_KEY }, (old) =>
        Array.isArray(old) ? old.map((t) => (t.id === id ? { ...t, ...patch } : t)) : old,
      )
      return { snapshot }
    },
    onError: (_e, _v, ctx) => ctx?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  })
}
