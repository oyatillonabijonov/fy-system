import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getEventTasks,
  getMyTasks,
  createTask,
  updateTask,
  deleteTask,
  copyEventTasks,
  getTaskComments,
  addTaskComment,
  type Task,
  type TaskDraft,
} from "@/lib/supabase/queries/tasks"

export const TASKS_KEY = ["tasks"] as const

/** eventId null = "Umumiy" tasks */
export function useEventTasks(eventId: string | null) {
  return useQuery<Task[]>({
    queryKey: [...TASKS_KEY, "event", eventId],
    queryFn: () => getEventTasks(eventId),
    refetchOnMount: true,
  })
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

function useTaskMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: TASKS_KEY }) })
}

export const useCreateTask = () => useTaskMutation((d: TaskDraft & { sort_order: number }) => createTask(d))
export const useDeleteTask = () => useTaskMutation((id: string) => deleteTask(id))
export const useCopyEventTasks = () => useTaskMutation((v: { from: string; to: string }) => copyEventTasks(v.from, v.to))
export const useAddTaskComment = () => useTaskMutation((v: { taskId: string; body: string }) => addTaskComment(v.taskId, v.body))

/** Optimistic, so a kanban drop or a status pick moves at once */
export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; patch: Partial<TaskDraft> }) => updateTask(v.id, v.patch),
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
