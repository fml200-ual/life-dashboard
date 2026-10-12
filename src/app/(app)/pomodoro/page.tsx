import { PomodoroClient } from "./pomodoro-client";

import { requireUser } from "@/lib/auth";
import { todayKey, toDateKey } from "@/lib/date";
import { prisma } from "@/lib/db";

export default async function PomodoroPage() {
  const user = await requireUser();

  const [preferences, pomodoros] = await Promise.all([
    prisma.userPreferences.findUnique({ where: { userId: user.id } }),
    prisma.pomodoroSession.findMany({
      where: { userId: user.id, completed: true },
      orderBy: { startedAt: "desc" },
      select: { phase: true, plannedSeconds: true, startedAt: true },
    }),
  ]);

  const today = todayKey(user.timezone);
  let todayCount = 0;

  for (const session of pomodoros) {
    if (toDateKey(session.startedAt, user.timezone) === today) {
      todayCount += 1;
    }
  }

  const totalMinutes = pomodoros.reduce(
    (acc, session) =>
      acc + (session.phase === "WORK" ? session.plannedSeconds : 0),
    0,
  );

  return (
    <PomodoroClient
      prefs={{
        workMinutes: preferences?.workMinutes ?? 25,
        shortBreakMinutes: preferences?.shortBreakMinutes ?? 5,
        longBreakMinutes: preferences?.longBreakMinutes ?? 15,
        longBreakInterval: preferences?.longBreakInterval ?? 4,
        dailyPomodoroGoal: preferences?.dailyPomodoroGoal ?? 8,
        notificationsEnabled: preferences?.notificationsEnabled ?? true,
      }}
      todayCount={todayCount}
      totalPomodoros={pomodoros.length}
      totalMinutes={totalMinutes}
    />
  );
}