import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { Task } from "@/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyCreatedTask, type TaskListItem } from "@/lib/task-list";

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findTasks: vi.fn(),
  findCategories: vi.fn(),
  findStreakDays: vi.fn(),
  findPreferences: vi.fn(),
  findPomodoros: vi.fn(),
}));

vi.mock("@/app/actions/tasks", () => ({
  createCategoryAction: vi.fn(),
  createTaskAction: vi.fn(),
  deleteTaskAction: vi.fn(),
  toggleTaskAction: vi.fn(),
  updateTaskAction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: h.requireUser }));

vi.mock("@/lib/db", () => ({
  prisma: {
    task: { findMany: h.findTasks },
    category: { findMany: h.findCategories },
    streakDay: { findMany: h.findStreakDays },
    userPreferences: { findUnique: h.findPreferences },
    pomodoroSession: { findMany: h.findPomodoros },
  },
}));

import DashboardPage from "@/app/(app)/dashboard/page";
import { TasksClient } from "@/app/(app)/tasks/tasks-client";

const historicalNotice =
  "Los acumulados anteriores a esta mejora solo reflejan el tiempo activo de WORK; no incluyen pausas ni descansos. Se conservan tal cual.";

const task = {
  id: "task-1",
  userId: "user-1",
  title: "Tarea de prueba",
  description: null,
  status: "TODO",
  priority: "MEDIUM",
  accumulatedSeconds: 3661,
  dueDate: null,
  completedAt: null,
  categoryId: null,
  createdAt: new Date("2026-10-13T08:00:00.000Z"),
  updatedAt: new Date("2026-10-13T08:00:00.000Z"),
} satisfies Task;

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "user-1", timezone: "UTC" });
  h.findTasks.mockResolvedValue([task]);
  h.findCategories.mockResolvedValue([]);
  h.findStreakDays.mockResolvedValue([]);
  h.findPreferences.mockResolvedValue(null);
  h.findPomodoros.mockResolvedValue([]);
});

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

describe("historical task-time notice", () => {
  it("shows the notice without changing the task accumulated time on /tasks", () => {
    const markup = renderToStaticMarkup(
      createElement(TasksClient, {
        initialTasks: [task],
        categories: [],
        today: "2026-10-14",
      }),
    );

    expect(markup).toContain(historicalNotice);
    expect(markup).toContain("Tiempo invertido: 1 hora 1 minuto 1 segundo");
  });

  it("shows the same notice and accumulated time on the dashboard", async () => {
    const page = await DashboardPage();
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain(historicalNotice);
    expect(markup).toContain("Tiempo invertido: 1 hora 1 minuto 1 segundo");
  });

  it("keeps the notice visible on /tasks when there are no tasks", () => {
    const markup = renderToStaticMarkup(
      createElement(TasksClient, {
        initialTasks: [],
        categories: [],
        today: "2026-10-14",
      }),
    );

    expect(markup).toContain(historicalNotice);
  });

  it("keeps the notice visible on the dashboard when there are no tasks", async () => {
    h.findTasks.mockResolvedValue([]);

    const page = await DashboardPage();

    expect(renderToStaticMarkup(page)).toContain(historicalNotice);
  });
});
