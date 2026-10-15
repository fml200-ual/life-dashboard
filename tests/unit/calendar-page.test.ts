import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findEvents: vi.fn(),
  findTasks: vi.fn(),
  findCategories: vi.fn(),
  todayKey: vi.fn(),
  today: "2026-10-15",
}));

vi.mock("@/lib/auth", () => ({ requireUser: h.requireUser }));
vi.mock("@/lib/date", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/date")>();
  return { ...actual, todayKey: h.todayKey };
});
vi.mock("@/lib/db", () => ({
  prisma: {
    calendarEvent: { findMany: h.findEvents },
    task: { findMany: h.findTasks },
    category: { findMany: h.findCategories },
  },
}));

import CalendarPage from "@/app/(app)/calendar/page";

beforeEach(() => {
  vi.clearAllMocks();
  h.today = "2026-10-15";
  h.todayKey.mockImplementation(() => h.today);
  h.requireUser.mockResolvedValue({
    id: "user-1",
    email: "ada@example.com",
    name: "Ada",
    timezone: "Asia/Tokyo",
  });
  h.findEvents.mockResolvedValue([]);
  h.findTasks.mockResolvedValue([]);
  h.findCategories.mockResolvedValue([]);
});

describe("CalendarPage server data", () => {
  it("loads the current local month, visible grid range, owned categories and UTC due-date bounds", async () => {
    await CalendarPage({ searchParams: Promise.resolve({}) });

    expect(h.requireUser).toHaveBeenCalledOnce();
    expect(h.todayKey).toHaveBeenCalledWith("Asia/Tokyo");
    expect(h.findEvents).toHaveBeenCalledWith({
      where: { userId: "user-1", dateKey: { gte: "2026-09-28", lte: "2026-11-01" } },
      orderBy: [{ dateKey: "asc" }, { allDay: "desc" }, { startMinutes: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        description: true,
        dateKey: true,
        allDay: true,
        startMinutes: true,
        endMinutes: true,
        categoryId: true,
        category: { select: { id: true, name: true, color: true } },
      },
    });
    expect(h.findTasks).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        dueDate: {
          gte: new Date("2026-09-28T00:00:00.000Z"),
          lte: new Date("2026-11-01T00:00:00.000Z"),
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        categoryId: true,
        category: { select: { id: true, name: true, color: true } },
      },
    });
    expect(h.findCategories).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    });
  });

  it("normalizes malformed parameters to the user's current date", async () => {
    const page = await CalendarPage({
      searchParams: Promise.resolve({ month: "2026-02", day: "2026-02-30" }),
    });

    expect(page.props["data-calendar-month"]).toBe("2026-10");
    expect(page.props["data-calendar-day"]).toBe("2026-10-15");
    expect(h.findEvents.mock.calls[0][0].where.dateKey).toEqual({
      gte: "2026-09-28",
      lte: "2026-11-01",
    });
  });

  it("uses a valid selected day as the visible month when month and day disagree", async () => {
    const page = await CalendarPage({
      searchParams: Promise.resolve({ month: "2026-10", day: "2026-03-04" }),
    });

    expect(page.props["data-calendar-month"]).toBe("2026-03");
    expect(page.props["data-calendar-day"]).toBe("2026-03-04");
    expect(h.findEvents.mock.calls[0][0].where.dateKey).toEqual({
      gte: "2026-02-23",
      lte: "2026-04-05",
    });
    expect(h.findTasks.mock.calls[0][0].where.dueDate).toEqual({
      gte: new Date("2026-02-23T00:00:00.000Z"),
      lte: new Date("2026-04-05T00:00:00.000Z"),
    });
  });

  it("treats repeated query parameters as invalid rather than picking one", async () => {
    const page = await CalendarPage({
      searchParams: Promise.resolve({ month: ["2026-10", "2026-11"], day: "2026-10-20" }),
    });

    expect(page.props["data-calendar-month"]).toBe("2026-10");
    expect(page.props["data-calendar-day"]).toBe("2026-10-15");
    expect(h.findEvents.mock.calls[0][0].where.dateKey).toEqual({
      gte: "2026-09-28",
      lte: "2026-11-01",
    });
  });

  it("passes serializable event, category, task date-key, and local today props to the client", async () => {
    h.findEvents.mockResolvedValue([
      {
        id: "event-1",
        title: "Planificación",
        description: null,
        dateKey: "2026-10-15",
        allDay: true,
        startMinutes: null,
        endMinutes: null,
        categoryId: "cat-1",
        category: { id: "cat-1", name: "Trabajo", color: "#123456" },
      },
    ]);
    h.findTasks.mockResolvedValue([
      {
        id: "task-1",
        title: "Entregar informe",
        status: "TODO",
        priority: "HIGH",
        dueDate: new Date("2026-10-15T00:00:00.000Z"),
        categoryId: null,
        category: null,
      },
    ]);
    h.findCategories.mockResolvedValue([{ id: "cat-1", name: "Trabajo", color: "#123456" }]);

    const page = await CalendarPage({ searchParams: Promise.resolve({}) });
    const client = page.props.children;

    expect(client.props).toMatchObject({
      initialMonth: "2026-10",
      initialSelectedDate: "2026-10-15",
      today: "2026-10-15",
      events: [
        {
          id: "event-1",
          dateKey: "2026-10-15",
          category: { id: "cat-1", name: "Trabajo", color: "#123456" },
        },
      ],
      tasks: [
        {
          id: "task-1",
          dateKey: "2026-10-15",
          status: "TODO",
          priority: "HIGH",
          category: null,
        },
      ],
      categories: [{ id: "cat-1", name: "Trabajo", color: "#123456" }],
    });
    expect(client.props.tasks[0].dateKey).toBe("2026-10-15");
  });
});
