import { describe, expect, it } from "vitest";

import { applyCreatedTask, type TaskListItem } from "@/lib/task-list";

describe("task list after create", () => {
  const existingTask = {
    id: "existing-task",
    title: "Tarea existente",
    description: null,
    status: "TODO",
    priority: "MEDIUM",
    accumulatedSeconds: 0,
    dueDate: null,
    completedAt: null,
    categoryId: null,
    createdAt: new Date("2026-10-13T08:00:00.000Z"),
    updatedAt: new Date("2026-10-13T08:00:00.000Z"),
  } satisfies TaskListItem;

  const createdTask = {
    ...existingTask,
    id: "created-task",
    title: "Tarea recién creada",
    createdAt: new Date("2026-10-13T09:00:00.000Z"),
    updatedAt: new Date("2026-10-13T09:00:00.000Z"),
  } satisfies TaskListItem;

  it("inserts the task returned by a successful create action without refreshing", () => {
    const tasks = [existingTask];

    const updated = applyCreatedTask(tasks, {
      ok: true,
      id: createdTask.id,
      task: createdTask,
    });

    expect(updated).toEqual([createdTask, existingTask]);
    expect(tasks).toEqual([existingTask]);
  });

  it("does not insert a fictitious row when the create action fails", () => {
    const tasks = [existingTask];

    const updated = applyCreatedTask(tasks, {
      ok: false,
      error: "No autorizado.",
      id: "not-created",
    });

    expect(updated).toBe(tasks);
    expect(updated).toEqual([existingTask]);
  });

  it("replaces an existing matching row instead of creating a duplicate", () => {
    const updatedTask = { ...createdTask, title: "Título confirmado" };

    const updated = applyCreatedTask(
      [createdTask, existingTask],
      { ok: true, id: createdTask.id, task: updatedTask },
    );

    expect(updated).toEqual([updatedTask, existingTask]);
  });
});
