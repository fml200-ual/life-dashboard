import Link from "next/link";

import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui";
import { computeStreak, addDaysToKey, todayKey, toDateKey } from "@/lib/date";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

const STATUS_LABEL: Record<string, string> = {
  TODO: "Pendiente",
  IN_PROGRESS: "En curso",
  DONE: "Hecha",
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  URGENT: "Urgente",
};

function longDateFromKey(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);

  return new Intl.DateTimeFormat("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export default async function DashboardPage() {
  const user = await requireUser();
  const timeZone = user.timezone;
  const today = todayKey(timeZone);

  const [tasks, categories, streakDays, prefs, pomodoros] = await Promise.all([
    prisma.task.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.category.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
    }),
    prisma.streakDay.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
    }),
    prisma.userPreferences.findUnique({ where: { userId: user.id } }),
    prisma.pomodoroSession.findMany({
      where: { userId: user.id, completed: true },
      select: { phase: true, plannedSeconds: true, startedAt: true },
    }),
  ]);

  const pendingTasks = tasks.filter((task) => task.status !== "DONE");
  const doneToday = tasks.filter(
    (task) => task.completedAt && toDateKey(task.completedAt, timeZone) === today,
  );
  const overdueTasks = pendingTasks.filter(
    (task) =>
      task.dueDate &&
      toDateKey(task.dueDate, timeZone) < today,
  );

  const todayPomodoros = pomodoros.filter(
    (session) => toDateKey(session.startedAt, timeZone) === today,
  ).length;
  const todayFocusMinutes = pomodoros
    .filter(
      (session) =>
        session.phase === "WORK" &&
        toDateKey(session.startedAt, timeZone) === today,
    )
    .reduce((acc, session) => acc + session.plannedSeconds / 60, 0);

  const dailyGoal = prefs?.dailyPomodoroGoal ?? 8;
  const pomodoroGoalPct = Math.min(100, Math.round((todayPomodoros / dailyGoal) * 100));

  const streakDaysByCategory = new Map<string, string[]>();

  for (const day of streakDays) {
    const days = streakDaysByCategory.get(day.categoryId) ?? [];
    days.push(day.date);
    streakDaysByCategory.set(day.categoryId, days);
  }

  const weekKeys: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    weekKeys.push(addDaysToKey(today, -i));
  }

  const dayCounts = new Map<string, Map<string, number>>();

  for (const category of categories) {
    dayCounts.set(category.id, new Map<string, number>());
  }

  for (const day of streakDays) {
    const map = dayCounts.get(day.categoryId);
    if (map) {
      map.set(day.date, day.count);
    }
  }

  const sortedStreaks = categories
    .map((category) => ({
      category,
      summary: computeStreak(streakDaysByCategory.get(category.id) ?? [], today),
    }))
    .sort((a, b) => b.summary.current - a.summary.current);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold capitalize tracking-tight">
          {longDateFromKey(today)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pendingTasks.length === 0
            ? "Todo al día. Bien hecho 👍"
            : `Tienes ${pendingTasks.length} tareas pendientes.`}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pendientes"
          value={String(pendingTasks.length)}
          hint={overdueTasks.length ? `${overdueTasks.length} vencidas` : "sin vencidas"}
          tone={pendingTasks.length ? "accent" : "default"}
        />
        <StatCard
          label="Completadas hoy"
          value={String(doneToday.length)}
          hint="tareas"
          tone="default"
        />
        <StatCard
          label="Foco de hoy"
          value={`${Math.round(todayFocusMinutes)} min`}
          hint={`${todayPomodoros}/${dailyGoal} pomodoros`}
          tone={todayPomodoros >= dailyGoal ? "good" : "default"}
        />
        <StatCard
          label="Rachas activas"
          value={String(
            sortedStreaks.filter((entry) => entry.summary.current > 0).length,
          )}
          hint="categorías"
          tone="default"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rachas por categoría</CardTitle>
            <Link href="/tasks" className="text-xs text-muted-foreground hover:text-foreground">
              Ver tareas →
            </Link>
          </CardHeader>
          <CardContent>
            {sortedStreaks.length === 0 ? (
              <EmptyState
                title="Sin categorías"
                description="Completa tareas por categoría para iniciar rachas."
              />
            ) : (
              <ul className="space-y-4">
                {sortedStreaks.map(({ category, summary }) => {
                  const current = summary.current;
                  const map = dayCounts.get(category.id) ?? new Map();

                  return (
                    <li key={category.id} className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        <span className="truncate text-sm font-medium">
                          {category.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          {weekKeys.map((day) => {
                            const count = map.get(day) ?? 0;
                            return (
                              <span
                                key={day}
                                title={`${day}: ${count}`}
                                className={`h-3 w-3 rounded-sm ${
                                  count
                                    ? "bg-primary"
                                    : "bg-muted dark:bg-muted/60"
                                }`}
                              />
                            );
                          })}
                        </div>
                        <span className="w-14 text-right text-sm font-semibold tabular-nums">
                          {current} <span className="text-xs font-normal text-muted-foreground">días</span>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hoy</CardTitle>
            <Link href="/pomodoro" className="text-xs text-muted-foreground hover:text-foreground">
              Ver pomodoro →
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {pomodoroGoalPct > 0 ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Objetivo de pomodoro</span>
                  <span>
                    {todayPomodoros}/{dailyGoal}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pomodoroGoalPct}%` }}
                  />
                </div>
              </div>
            ) : null}

            <ul className="divide-y divide-border">
              {doneToday.slice(0, 5).map((task) => (
                <li key={task.id} className="flex items-center gap-2 py-2">
                  <span className="text-emerald-500">✓</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                  <Badge>{PRIORITY_LABEL[task.priority]}</Badge>
                </li>
              ))}
              {doneToday.length === 0 ? (
                <li className="py-2 text-sm text-muted-foreground">
                  Nada completado todavía hoy.
                </li>
              ) : null}
            </ul>

            {overdueTasks.length ? (
              <p className="text-xs text-red-600 dark:text-red-400">
                {overdueTasks.length} tarea{overdueTasks.length > 1 ? "s" : ""} vencida
                {overdueTasks.length > 1 ? "s" : ""}.
              </p>
            ) : null}

            <Link href="/tasks" className="block text-xs text-muted-foreground hover:text-foreground">
              Ir a tareas →
            </Link>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Próximas tareas</CardTitle>
          <Badge>{pendingTasks.length} pendientes</Badge>
        </CardHeader>
        <CardContent>
          {pendingTasks.length === 0 ? (
            <EmptyState
              title="Sin tareas pendientes"
              description="Cuando añadas tareas aparecerán aquí."
            />
          ) : (
            <ul className="divide-y divide-border">
              {pendingTasks.slice(0, 8).map((task) => (
                <li key={task.id} className="flex items-center gap-3 py-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {STATUS_LABEL[task.status]} · {PRIORITY_LABEL[task.priority]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "accent" | "good";
}) {
  const toneClass =
    tone === "accent"
      ? "text-indigo-600 dark:text-indigo-400"
      : tone === "good"
        ? "text-emerald-600 dark:text-emerald-400"
        : "";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}