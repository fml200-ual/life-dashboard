import { PomodoroClient } from "./pomodoro-client";

import { requireUser } from "@/lib/auth";
import { todayKey } from "@/lib/date";
import { prisma } from "@/lib/db";
import {
  countCompletedWorkSessionsForDay,
  getPomodoroSessionSeconds,
} from "@/lib/pomodoro";

export default async function PomodoroPage() {
  const user = await requireUser();

  const [preferences, pomodoros, tasks] = await Promise.all([
    prisma.userPreferences.findUnique({ where: { userId: user.id } }),
    prisma.pomodoroSession.findMany({
      where: { userId: user.id, completed: true },
      orderBy: { startedAt: "desc" },
      select: {
        phase: true,
        plannedSeconds: true,
        actualSeconds: true,
        startedAt: true,
        completed: true,
      },
    }),
    prisma.task.findMany({
      where: { userId: user.id, status: { not: "DONE" } },
      orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true },
    }),
  ]);

  const today = todayKey(user.timezone);
  const todayCount = countCompletedWorkSessionsForDay(
    pomodoros,
    today,
    user.timezone,
  );

  const totalMinutes = pomodoros.reduce(
    (acc, session) => acc + getPomodoroSessionSeconds(session),
    0,
  ) / 60;

  return (
    <PomodoroClient
      prefs={{
        workMinutes: preferences?.workMinutes ?? 25,
        shortBreakMinutes: preferences?.shortBreakMinutes ?? 5,
        longBreakMinutes: preferences?.longBreakMinutes ?? 15,
        longBreakInterval: preferences?.longBreakInterval ?? 4,
        dailyPomodoroGoal: preferences?.dailyPomodoroGoal ?? 8,
        notificationsEnabled: preferences?.notificationsEnabled ?? true,
        autoAdvance: preferences?.autoAdvance ?? false,
      }}
      tasks={tasks}
      todayCount={todayCount}
      today={today}
      timeZone={user.timezone}
      totalPomodoros={pomodoros.length}
      totalMinutes={totalMinutes}
    />
  );
}
