import { getMonthGrid, isValidDateKey, isValidMonthKey, selectCalendarDate } from "@/lib/calendar";
import { requireUser } from "@/lib/auth";
import { utcMidnightFromDateKey, todayKey } from "@/lib/date";
import { prisma } from "@/lib/db";
import { CalendarClient } from "./calendar-client";

type CalendarSearchParams = {
  [key: string]: string | string[] | undefined;
};

function singleParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function resolveCalendarSelection(
  searchParams: CalendarSearchParams,
  today: string,
): { monthKey: string; selectedDate: string } {
  const rawMonth = searchParams.month;
  const rawDay = searchParams.day;
  const month = singleParam(rawMonth);
  const day = singleParam(rawDay);
  const hasInvalidParameter =
    (rawMonth !== undefined && (!month || !isValidMonthKey(month))) ||
    (rawDay !== undefined && (!day || !isValidDateKey(day)));

  if (hasInvalidParameter) return selectCalendarDate(today);

  if (day) {
    // La fecha seleccionada prevalece para mantener selección y mes visibles coherentes.
    return selectCalendarDate(day);
  }

  if (month) {
    const currentMonth = today.slice(0, 7);
    return selectCalendarDate(month === currentMonth ? today : `${month}-01`);
  }

  return selectCalendarDate(today);
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<CalendarSearchParams>;
}) {
  const user = await requireUser();
  const today = todayKey(user.timezone);
  const selection = resolveCalendarSelection(await searchParams, today);
  const grid = getMonthGrid(selection.monthKey);
  const gridStart = grid[0].dateKey;
  const gridEnd = grid[grid.length - 1].dateKey;

  const [events, tasks, categories] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: {
        userId: user.id,
        dateKey: { gte: gridStart, lte: gridEnd },
      },
      orderBy: [
        { dateKey: "asc" },
        { allDay: "desc" },
        { startMinutes: "asc" },
        { id: "asc" },
      ],
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
    }),
    prisma.task.findMany({
      where: {
        userId: user.id,
        dueDate: {
          gte: utcMidnightFromDateKey(gridStart),
          lte: utcMidnightFromDateKey(gridEnd),
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
    }),
    prisma.category.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);

  return (
    <div
      data-calendar-month={selection.monthKey}
      data-calendar-day={selection.selectedDate}
      data-event-count={events.length}
      data-task-count={tasks.length}
      data-category-count={categories.length}
    >
      <CalendarClient
        initialMonth={selection.monthKey}
        initialSelectedDate={selection.selectedDate}
        today={today}
        events={events}
        tasks={tasks.flatMap((task) => task.dueDate ? [{
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          dateKey: dateKeyFromUtc(task.dueDate),
          categoryId: task.categoryId,
          category: task.category,
        }] : [])}
        categories={categories}
      />
    </div>
  );
}

function dateKeyFromUtc(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
