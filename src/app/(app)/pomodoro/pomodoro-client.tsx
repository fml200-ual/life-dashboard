"use client";

import { useEffect, useRef, useState } from "react";

import { completePomodoroAction } from "@/app/actions/pomodoro";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

type Mode = "WORK" | "SHORT_BREAK" | "LONG_BREAK";

const STORAGE_KEY = "ld-pomodoro";
const MAX_PAUSE_MS = 1000 * 60 * 60 * 24; // 24 h

type Stored = {
  mode: Mode;
  endAt: number; // epoch ms, 0 si está en pausa
  remainingSeconds: number;
  plannedSeconds: number;
};

type Bootstrap = {
  mode: Mode;
  plannedSeconds: number;
  remaining: number;
  running: boolean;
  paused: boolean;
  endAt: number;
  status: string | null;
};

type Prefs = {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
  dailyPomodoroGoal: number;
  notificationsEnabled: boolean;
};

const MODE_LABEL: Record<Mode, string> = {
  WORK: "Concentración",
  SHORT_BREAK: "Descanso corto",
  LONG_BREAK: "Descanso largo",
};

const MODE_COLOR: Record<Mode, string> = {
  WORK: "text-indigo-600 dark:text-indigo-400",
  SHORT_BREAK: "text-emerald-600 dark:text-emerald-400",
  LONG_BREAK: "text-teal-600 dark:text-teal-400",
};

const RING_COLOR: Record<Mode, string> = {
  WORK: "stroke-indigo-500 dark:stroke-indigo-400",
  SHORT_BREAK: "stroke-emerald-500 dark:stroke-emerald-400",
  LONG_BREAK: "stroke-teal-500 dark:stroke-teal-400",
};

function readStorage(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Stored;
    if (
      parsed.mode !== "WORK" &&
      parsed.mode !== "SHORT_BREAK" &&
      parsed.mode !== "LONG_BREAK"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(stored: Stored): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function formatTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function minutesToSeconds(minutes: number): number {
  return minutes * 60;
}

export function PomodoroClient({
  prefs,
  todayCount,
  totalPomodoros,
  totalMinutes,
}: {
  prefs: Prefs;
  todayCount: number;
  totalPomodoros: number;
  totalMinutes: number;
}) {
  const plannedFor = (mode: Mode): number =>
    minutesToSeconds(
      mode === "WORK"
        ? prefs.workMinutes
        : mode === "SHORT_BREAK"
          ? prefs.shortBreakMinutes
          : prefs.longBreakMinutes,
    );

  // Hidrata el temporizador desde localStorage una sola vez (montaje).
  // Si la sesión guardada aún tiene tiempo pendiente, se reanuda; si expiró
  // o pasó más de 24 h, se descarta y comienza de cero.
  const [bootstrap] = useState<Bootstrap>(() => {
    const stored = readStorage();
    const now = Date.now();

    if (stored && stored.endAt > 0 && stored.endAt > now && stored.endAt - now < MAX_PAUSE_MS) {
      return {
        mode: stored.mode,
        plannedSeconds: stored.plannedSeconds,
        remaining: Math.ceil((stored.endAt - now) / 1000),
        running: true,
        paused: false,
        endAt: stored.endAt,
        status: `Sesión reanudada · ${MODE_LABEL[stored.mode].toLowerCase()}`,
      };
    }

    if (stored && stored.endAt === 0 && stored.remainingSeconds > 0) {
      return {
        mode: stored.mode,
        plannedSeconds: stored.plannedSeconds,
        remaining: stored.remainingSeconds,
        running: false,
        paused: true,
        endAt: 0,
        status: "Sesión en pausa reanudada",
      };
    }

    return {
      mode: "WORK",
      plannedSeconds: plannedFor("WORK"),
      remaining: plannedFor("WORK"),
      running: false,
      paused: false,
      endAt: 0,
      status: null,
    };
  });

  const [mode, setMode] = useState<Mode>(bootstrap.mode);
  const [plannedSeconds, setPlannedSeconds] = useState(bootstrap.plannedSeconds);
  const [remaining, setRemaining] = useState(bootstrap.remaining);
  const [running, setRunning] = useState(bootstrap.running);
  const [paused, setPaused] = useState(bootstrap.paused);
  const [status, setStatus] = useState<string | null>(bootstrap.status);
  const [completedToday, setCompletedToday] = useState(todayCount);
  const [totalDone, setTotalDone] = useState(totalPomodoros);
  const [totalMin, setTotalMin] = useState(totalMinutes);

  const endAtRef = useRef<number>(bootstrap.endAt);
  const plannedRef = useRef<number>(bootstrap.plannedSeconds);
  const finishedRef = useRef(false);

  const completionRef = useRef<() => Promise<void>>(async () => {});

  function start() {
    const now = Date.now();
    const seconds = plannedRef.current;
    const endAt = now + seconds * 1000;

    endAtRef.current = endAt;
    finishedRef.current = false;
    setRunning(true);
    setPaused(false);
    setStatus(null);
    setRemaining(seconds);

    writeStorage({
      mode,
      endAt,
      remainingSeconds: seconds,
      plannedSeconds: seconds,
    });

    if (
      prefs.notificationsEnabled &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission();
    }
  }

  function pause() {
    const secondsLeft = endAtRef.current
      ? Math.max(1, Math.ceil((endAtRef.current - Date.now()) / 1000))
      : remaining;

    setRunning(false);
    setPaused(true);
    setRemaining(secondsLeft);
    setStatus("En pausa");
    endAtRef.current = 0;

    writeStorage({
      mode,
      endAt: 0,
      remainingSeconds: secondsLeft,
      plannedSeconds: plannedRef.current,
    });
  }

  function resume() {
    const now = Date.now();
    const endAt = now + remaining * 1000;

    endAtRef.current = endAt;
    finishedRef.current = false;
    setRunning(true);
    setPaused(false);
    setStatus(null);

    writeStorage({
      mode,
      endAt,
      remainingSeconds: remaining,
      plannedSeconds: plannedRef.current,
    });
  }

  function selectMode(nextMode: Mode) {
    if (running) {
      return;
    }

    const seconds = plannedFor(nextMode);
    setMode(nextMode);
    setPlannedSeconds(seconds);
    plannedRef.current = seconds;
    setRemaining(seconds);
  }

  function cancel() {
    finishedRef.current = true;
    endAtRef.current = 0;
    setRunning(false);
    setPaused(false);
    setStatus("Sesión anulada (no se registra)");
    clearStorage();

    const seconds = plannedFor(mode);
    setPlannedSeconds(seconds);
    plannedRef.current = seconds;
    setRemaining(seconds);
  }

  function notify(title: string, body: string) {
    if (
      !prefs.notificationsEnabled ||
      typeof window === "undefined" ||
      !("Notification" in window)
    ) {
      return;
    }

    if (Notification.permission === "granted") {
      new Notification(title, { body });
    }
  }

  async function handleFinished() {
    const phase = mode;
    const seconds = plannedRef.current;
    const endedAt = new Date().toISOString();

    const formData = new FormData();
    formData.set("phase", phase);
    formData.set("plannedSeconds", String(seconds));
    formData.set("endedAt", endedAt);

    const result = await completePomodoroAction(formData);

    const nextToday = completedToday + 1;
    setCompletedToday(nextToday);
    setTotalDone(totalDone + 1);
    setTotalMin(totalMin + seconds / 60);
    endAtRef.current = 0;
    setRunning(false);
    setPaused(false);
    clearStorage();

    if (result.ok) {
      setStatus(
        phase === "WORK"
          ? "Concentración completada. ¡Buen trabajo!"
          : `${MODE_LABEL[phase]} completado.`,
      );
    } else {
      setStatus(result.error ?? "No se pudo guardar la sesión.");
    }

    if (phase === "WORK") {
      notify("Pomodoro completado", "Toca descanso, lo has ganado.");

      const nextMode: Mode =
        nextToday % prefs.longBreakInterval === 0 ? "LONG_BREAK" : "SHORT_BREAK";
      const secondsForNext = plannedFor(nextMode);

      setMode(nextMode);
      setPlannedSeconds(secondsForNext);
      plannedRef.current = secondsForNext;
      setRemaining(secondsForNext);
    }
  }

  useEffect(() => {
    completionRef.current = handleFinished;
  });

  useEffect(() => {
    if (!running || !endAtRef.current) {
      return;
    }

    const interval = setInterval(() => {
      const left = Math.ceil((endAtRef.current - Date.now()) / 1000);

      if (left <= 0 && !finishedRef.current) {
        finishedRef.current = true;
        void completionRef.current();
        return;
      }

      setRemaining(left);
    }, 500);

    return () => clearInterval(interval);
  }, [running]);

  const progress =
    plannedSeconds > 0 ? (plannedSeconds - remaining) / plannedSeconds : 0;
  const progressPercent = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  const RADIUS = 120;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pomodoro</h1>
          <p className="mt-1 text-sm text-muted-foreground">Técnica de concentración</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2 text-sm">
          <span className="text-muted-foreground">
            Hoy{" "}
            <strong className="font-semibold text-foreground">
              {completedToday}
            </strong>
            /{prefs.dailyPomodoroGoal}
          </span>
          <span className="text-muted-foreground">
            Total <strong className="font-semibold text-foreground">{totalDone}</strong>
            {" · "}
            {Math.round(totalMin)} min
          </span>
        </div>
      </div>

      <Card className="flex flex-col items-center gap-6 p-8">
        <div className="flex gap-2">
          {(["WORK", "SHORT_BREAK", "LONG_BREAK"] as Mode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => selectMode(item)}
              disabled={running}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                mode === item
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50",
              )}
            >
              {MODE_LABEL[item]}
            </button>
          ))}
        </div>

        <svg
          width="280"
          height="280"
          viewBox="0 0 280 280"
          role="img"
          aria-label={`Temporizador: ${formatTime(remaining)}`}
        >
          <circle
            cx="140"
            cy="140"
            r={RADIUS}
            fill="none"
            strokeWidth="10"
            className="stroke-border"
          />
          <circle
            cx="140"
            cy="140"
            r={RADIUS}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            className={cn("transition-[stroke-dashoffset] duration-500", RING_COLOR[mode])}
            transform="rotate(-90 140 140)"
          />
          <text
            x="140"
            y="146"
            textAnchor="middle"
            dominantBaseline="middle"
            className={cn("fill-current text-5xl font-semibold tabular-nums", MODE_COLOR[mode])}
          >
            {formatTime(remaining)}
          </text>
        </svg>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {running ? (
            <>
              <Button variant="secondary" onClick={pause} className="min-w-28">
                Pausar
              </Button>
              <Button variant="ghost" onClick={cancel}>
                Abandonar
              </Button>
            </>
          ) : paused ? (
            <>
              <Button onClick={resume} className="min-w-28">
                Reanudar
              </Button>
              <Button variant="ghost" onClick={cancel}>
                Anular
              </Button>
            </>
          ) : (
            <Button onClick={start} className="min-w-28">
              Iniciar
            </Button>
          )}
        </div>

        <div className="flex w-full max-w-sm flex-col items-center gap-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">{status ?? MODE_LABEL[mode]}</p>
        </div>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        El temporizador conserva el momento del fin programado: puedes cerrar la
        pestaña y retomarla antes de 24 horas; si se agota sin terminar, la
        sesión se anula y no se registra.
      </p>
    </div>
  );
}