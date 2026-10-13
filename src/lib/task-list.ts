import type { Task } from "@/generated/prisma/client";

export type TaskListItem = Omit<Task, "userId">;

export type CreateTaskResult = {
  ok: boolean;
  error?: string;
  id?: string;
  task?: TaskListItem;
};

export function applyCreatedTask(
  tasks: TaskListItem[],
  result: CreateTaskResult,
): TaskListItem[] {
  if (!result.ok || !result.id || !result.task || result.task.id !== result.id) {
    return tasks;
  }

  return [result.task, ...tasks.filter((task) => task.id !== result.id)];
}
