import { sortAgendaEvents, type CalendarSelection } from "@/lib/calendar";

export type CalendarCategoryView = {
  id: string;
  name: string;
  color: string;
};

export type CalendarEventView = {
  id: string;
  title: string;
  description: string | null;
  dateKey: string;
  allDay: boolean;
  startMinutes: number | null;
  endMinutes: number | null;
  categoryId: string | null;
  category: CalendarCategoryView | null;
};

export type CalendarTaskView = {
  id: string;
  title: string;
  dateKey: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  categoryId: string | null;
  category: CalendarCategoryView | null;
};

export type CalendarCategoryFilter = "ALL" | "NONE" | string;

export function filterCalendarEntries<E extends { categoryId: string | null }, T extends { categoryId: string | null }>(
  events: readonly E[],
  tasks: readonly T[],
  categoryFilter: CalendarCategoryFilter,
): { events: E[]; tasks: T[] } {
  if (categoryFilter === "ALL") return { events: [...events], tasks: [...tasks] };

  const matches = (item: { categoryId: string | null }) =>
    categoryFilter === "NONE" ? item.categoryId === null : item.categoryId === categoryFilter;

  return {
    events: events.filter(matches),
    tasks: tasks.filter(matches),
  };
}

export function getDayAgenda<E extends CalendarEventView, T extends CalendarTaskView>(
  dateKey: string,
  events: readonly E[],
  tasks: readonly T[],
): { events: E[]; tasks: T[] } {
  const dayEvents = sortAgendaEvents(events.filter((event) => event.dateKey === dateKey));
  const dayTasks = tasks.filter((task) => task.dateKey === dateKey);

  return { events: dayEvents, tasks: dayTasks };
}

export function getDayPreview<E extends CalendarEventView, T extends CalendarTaskView>(
  dateKey: string,
  events: readonly E[],
  tasks: readonly T[],
  limit: number,
): { items: Array<E | T>; hiddenCount: number } {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new RangeError("El límite de elementos visibles debe ser un entero no negativo.");
  }

  const agenda = getDayAgenda(dateKey, events, tasks);
  const items: Array<E | T> = [...agenda.events, ...agenda.tasks];

  return {
    items: items.slice(0, limit),
    hiddenCount: Math.max(0, items.length - limit),
  };
}

export function parseLocalTime(value: string, field: "start" | "end"): number | null {
  if (field === "end" && value === "24:00") return 1440;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  return hour * 60 + minute;
}

export function formatLocalTime(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) return "";
  if (minutes === 1440) return "24:00";

  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function buildCalendarHref(selection: CalendarSelection): string {
  return `/calendar?month=${selection.monthKey}&day=${selection.selectedDate}`;
}
