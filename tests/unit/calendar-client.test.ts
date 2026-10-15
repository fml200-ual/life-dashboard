import { describe, expect, it } from "vitest";

import {
  buildCalendarHref,
  filterCalendarEntries,
  getDayAgenda,
  getDayPreview,
  parseLocalTime,
} from "@/lib/calendar-view";

const event = (
  id: string,
  dateKey: string,
  allDay: boolean,
  startMinutes: number | null,
  categoryId: string | null = null,
) => ({
  id,
  title: `Evento ${id}`,
  description: null,
  dateKey,
  allDay,
  startMinutes,
  endMinutes: allDay ? null : (startMinutes ?? 0) + 60,
  categoryId,
  category: categoryId ? { id: categoryId, name: `Categoría ${categoryId}`, color: "#123456" } : null,
});

const task = (
  id: string,
  dateKey: string,
  categoryId: string | null = null,
  status: "TODO" | "IN_PROGRESS" | "DONE" = "TODO",
) => ({
  id,
  title: `Tarea ${id}`,
  dateKey,
  status,
  priority: "MEDIUM" as const,
  categoryId,
  category: categoryId ? { id: categoryId, name: `Categoría ${categoryId}`, color: "#123456" } : null,
});

describe("calendar client view helpers", () => {
  it("filters events and tasks together by category, including uncategorized items", () => {
    const events = [event("e1", "2026-10-15", true, null, "work"), event("e2", "2026-10-15", true, null)];
    const tasks = [task("t1", "2026-10-15", "work"), task("t2", "2026-10-15")];

    expect(filterCalendarEntries(events, tasks, "ALL")).toEqual({ events, tasks });
    expect(filterCalendarEntries(events, tasks, "work")).toEqual({
      events: [events[0]],
      tasks: [tasks[0]],
    });
    expect(filterCalendarEntries(events, tasks, "NONE")).toEqual({
      events: [events[1]],
      tasks: [tasks[1]],
    });
  });

  it("orders the day agenda with all-day events, timed events, and separate tasks", () => {
    const events = [
      event("later", "2026-10-15", false, 600),
      event("all-day", "2026-10-15", true, null),
      event("earlier", "2026-10-15", false, 540),
      event("other-day", "2026-10-16", true, null),
    ];
    const tasks = [task("z", "2026-10-15"), task("a", "2026-10-15"), task("other", "2026-10-16")];

    expect(getDayAgenda("2026-10-15", events, tasks)).toEqual({
      events: [events[1], events[2], events[0]],
      tasks: [tasks[0], tasks[1]],
    });
  });

  it("limits day-cell items and reports overflow without dropping agenda entries", () => {
    const events = [
      event("e1", "2026-10-15", true, null),
      event("e2", "2026-10-15", true, null),
      event("e3", "2026-10-15", false, 540),
    ];
    const tasks = [task("t1", "2026-10-15"), task("t2", "2026-10-15")];

    expect(getDayPreview("2026-10-15", events, tasks, 3)).toEqual({
      items: [events[0], events[1], events[2]],
      hiddenCount: 2,
    });
    expect(getDayAgenda("2026-10-15", events, tasks).tasks).toHaveLength(2);
  });

  it("converts local HH:mm values to day minutes and permits only end 24:00", () => {
    expect(parseLocalTime("00:00", "start")).toBe(0);
    expect(parseLocalTime("23:59", "start")).toBe(1439);
    expect(parseLocalTime("24:00", "end")).toBe(1440);
    expect(parseLocalTime("24:00", "start")).toBeNull();
    expect(parseLocalTime("24:01", "end")).toBeNull();
    expect(parseLocalTime("9:30", "start")).toBeNull();
    expect(parseLocalTime("", "end")).toBeNull();
  });

  it("keeps month and selected day together in navigation URLs", () => {
    expect(buildCalendarHref({ monthKey: "2026-10", selectedDate: "2026-10-15" })).toBe(
      "/calendar?month=2026-10&day=2026-10-15",
    );
  });
});
