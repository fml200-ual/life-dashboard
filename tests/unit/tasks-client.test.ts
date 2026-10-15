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
  findCalendarEvents: vi.fn(),
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
    calendarEvent: { findMany: h.findCalendarEvents },
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
  h.findCalendarEvents.mockResolvedValue([]);
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

describe("dashboard upcoming calendar events", () => {
  it("queries only the user's events from local today through the seventh following day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T02:30:00.000Z"));
    h.requireUser.mockResolvedValue({ id: "user-1", timezone: "America/Los_Angeles" });

    try {
      await DashboardPage();

      expect(h.findCalendarEvents).toHaveBeenCalledWith({
        where: {
          userId: "user-1",
          dateKey: { gte: "2026-10-14", lte: "2026-10-21" },
        },
        orderBy: [
          { dateKey: "asc" },
          { allDay: "desc" },
          { startMinutes: "asc" },
        ],
        select: {
          id: true,
          title: true,
          dateKey: true,
          allDay: true,
          startMinutes: true,
          category: { select: { name: true, color: true } },
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows event dates as civil dates and links to the first event's selected day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T02:30:00.000Z"));
    h.requireUser.mockResolvedValue({ id: "user-1", timezone: "America/Los_Angeles" });
    h.findCalendarEvents.mockResolvedValue([
      {
        id: "event-1",
        title: "Cita temprana",
        dateKey: "2026-10-14",
        allDay: false,
        startMinutes: 570,
        category: { name: "Personal", color: "#123456" },
      },
    ]);

    try {
      const markup = renderToStaticMarkup(await DashboardPage());

      expect(markup).toContain("Próximos eventos");
      expect(markup).toContain("Cita temprana");
      expect(markup).toContain("14-10-2026");
      expect(markup).not.toContain("13-10-2026");
      expect(markup).not.toContain("15-10-2026");
      expect(markup).toContain("09:30");
      expect(markup).toContain('href="/calendar?month=2026-10&amp;day=2026-10-14"');
      expect(markup).toContain('href="/calendar"');
    } finally {
      vi.useRealTimers();
    }
  });

  it("limits the card to five events and shows a useful empty state when none are upcoming", async () => {
    const events = Array.from({ length: 6 }, (_, index) => ({
      id: `event-${index + 1}`,
      title: `Evento ${index + 1}`,
      dateKey: "2026-10-15",
      allDay: true,
      startMinutes: null,
      category: null,
    }));
    h.findCalendarEvents.mockResolvedValue(events);

    const fullMarkup = renderToStaticMarkup(await DashboardPage());
    expect(fullMarkup).toContain("Evento 5");
    expect(fullMarkup).not.toContain("Evento 6");

    h.findCalendarEvents.mockResolvedValue([]);
    const emptyMarkup = renderToStaticMarkup(await DashboardPage());
    expect(emptyMarkup).toContain("No hay eventos próximos.");
    expect(emptyMarkup).toContain('href="/calendar"');
  });
});
