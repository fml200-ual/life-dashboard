"use client";

import { useEffect, useRef, useState } from "react";

import { completePomodoroAction } from "@/app/actions/pomodoro";
import { Button, Card } from "@/components/ui";
import { toDateKey } from "@/lib/date";
import {
  calculateActualSeconds,
  getCompletedWorkSessionsTodayAfterCompletion,
  getNextPomodoroPhase,
  parsePomodoroState,
  recoverPomodoroState,
  serializePomodoroState,
  type ActiveTimeSegment,
  type PomodoroPhaseRegistration,
  type StoredPomodoroState,
} from "@/lib/pomodoro";
import {
  closePomodoroActiveSegment,
  createSingleFlightPomodoroRegistration,
  createCompletionStopSignal,
  finishPomodoroPhase,
  getPomodoroTaskAssignment,
  submitPomodoroPhaseRegistration,
  type CompletionStopIntent,
} from "@/lib/pomodoro-completion";
import { cn } from "@/lib/utils";

type Mode = "WORK" | "SHORT_BREAK" | "LONG_BREAK";

const STORAGE_KEY = "ld-pomodoro";
const MAX_PAUSE_MS = 1000 * 60 * 60 * 24; // 24 h

type Stored = StoredPomodoroState;

type Bootstrap = {
  mode: Mode;
  plannedSeconds: number;
  remaining: number;
  running: boolean;
  paused: boolean;
  endAt: number;
  taskId: string | null;
  cycleTaskId: string | null;
  sessionId: string | null;
  activeSegments: readonly ActiveTimeSegment[];
  accumulatedActiveSeconds: number;
  segmentStartedAt: number | null;
  sessionStartedAt: number | null;
  savedAt: number;
  status: string | null;
  pendingRegistration: PomodoroPhaseRegistration | null;
};

type Prefs = {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
  dailyPomodoroGoal: number;
  notificationsEnabled: boolean;
  autoAdvance: boolean;
};

type PendingTask = { id: string; title: string };

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

    return parsePomodoroState(raw);
  } catch {
    return null;
  }
}

function writeStorage(stored: Stored): void {
  localStorage.setItem(STORAGE_KEY, serializePomodoroState(stored));
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
  tasks,
  todayCount,
  today,
  timeZone,
  totalPomodoros,
  totalMinutes,
}: {
  prefs: Prefs;
  tasks: PendingTask[];
  todayCount: number;
  today: string;
  timeZone: string;
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
    const pendingRegistration = stored?.pendingRegistration ?? null;

    // Un registro terminal no expira junto con una fase en curso: conserva el
    // payload original hasta que el servidor confirme un reintento idempotente.
    if (stored && pendingRegistration) {
      return {
        mode: pendingRegistration.phase,
        plannedSeconds: pendingRegistration.plannedSeconds,
        remaining: pendingRegistration.plannedSeconds,
        running: false,
        paused: false,
        endAt: 0,
        taskId: pendingRegistration.phase === "WORK" ? pendingRegistration.taskId : null,
        cycleTaskId: pendingRegistration.taskId ?? stored.cycleTaskId ?? null,
        sessionId: pendingRegistration.sessionId,
        activeSegments: pendingRegistration.activeSegments,
        accumulatedActiveSeconds: calculateActualSeconds(pendingRegistration.activeSegments),
        segmentStartedAt: null,
        sessionStartedAt: pendingRegistration.startedAt,
        savedAt: stored.savedAt,
        status: "Registro pendiente · reintenta para confirmar la fase",
        pendingRegistration,
      };
    }
    const recovered = recoverPomodoroState(stored, now, MAX_PAUSE_MS);

    if (recovered && recovered.endAt > 0) {
      return {
        mode: recovered.mode,
        plannedSeconds: recovered.plannedSeconds,
        remaining: Math.ceil((recovered.endAt - now) / 1000),
        running: true,
        paused: false,
        endAt: recovered.endAt,
        taskId: recovered.taskId,
        cycleTaskId: recovered.cycleTaskId ?? recovered.taskId,
        sessionId: recovered.sessionId ?? null,
        activeSegments: recovered.activeSegments ?? [],
        accumulatedActiveSeconds: recovered.accumulatedActiveSeconds,
        segmentStartedAt: recovered.segmentStartedAt,
        sessionStartedAt: recovered.sessionStartedAt,
        savedAt: recovered.savedAt,
        status: `Sesión reanudada · ${MODE_LABEL[recovered.mode].toLowerCase()}`,
        pendingRegistration: null,
      };
    }

    if (recovered && recovered.endAt === 0) {
      return {
        mode: recovered.mode,
        plannedSeconds: recovered.plannedSeconds,
        remaining: recovered.remainingSeconds,
        running: false,
        paused: true,
        endAt: 0,
        taskId: recovered.taskId,
        cycleTaskId: recovered.cycleTaskId ?? recovered.taskId,
        sessionId: recovered.sessionId ?? null,
        activeSegments: recovered.activeSegments ?? [],
        accumulatedActiveSeconds: recovered.accumulatedActiveSeconds,
        segmentStartedAt: null,
        sessionStartedAt: recovered.sessionStartedAt,
        savedAt: recovered.savedAt,
        status: "Sesión en pausa reanudada",
        pendingRegistration: null,
      };
    }

    return {
      mode: "WORK",
      plannedSeconds: plannedFor("WORK"),
      remaining: plannedFor("WORK"),
      running: false,
      paused: false,
      endAt: 0,
      taskId: null,
      cycleTaskId: null,
      sessionId: null,
      activeSegments: [],
      accumulatedActiveSeconds: 0,
      segmentStartedAt: null,
      sessionStartedAt: null,
      savedAt: 0,
      status: null,
      pendingRegistration: null,
    };
  });

  const [mode, setMode] = useState<Mode>(bootstrap.mode);
  const [plannedSeconds, setPlannedSeconds] = useState(bootstrap.plannedSeconds);
  const [remaining, setRemaining] = useState(bootstrap.remaining);
  const [running, setRunning] = useState(bootstrap.running);
  const [paused, setPaused] = useState(bootstrap.paused);
  const [status, setStatus] = useState<string | null>(bootstrap.status);
  const [taskId, setTaskId] = useState<string | null>(bootstrap.taskId);
  const [completedToday, setCompletedToday] = useState(todayCount);
  const [totalDone, setTotalDone] = useState(totalPomodoros);
  const [totalMin, setTotalMin] = useState(totalMinutes);
  const [completionPending, setCompletionPending] = useState(false);
  const [abandonPending, setAbandonPending] = useState(false);
  const [completionStopIntent, setCompletionStopIntent] =
    useState<CompletionStopIntent | null>(null);
  const [pendingRegistration, setPendingRegistration] = useState<PomodoroPhaseRegistration | null>(
    bootstrap.pendingRegistration,
  );

  const endAtRef = useRef<number>(bootstrap.endAt);
  const plannedRef = useRef<number>(bootstrap.plannedSeconds);
  const taskIdRef = useRef<string | null>(bootstrap.taskId);
  const cycleTaskIdRef = useRef<string | null>(bootstrap.cycleTaskId);
  const sessionIdRef = useRef<string | null>(bootstrap.sessionId);
  const activeSegmentsRef = useRef<readonly ActiveTimeSegment[]>(bootstrap.activeSegments);
  const accumulatedActiveSecondsRef = useRef<number>(bootstrap.accumulatedActiveSeconds);
  const segmentStartedAtRef = useRef<number | null>(bootstrap.segmentStartedAt);
  const sessionStartedAtRef = useRef<number | null>(bootstrap.sessionStartedAt);
  const pendingRegistrationRef = useRef<PomodoroPhaseRegistration | null>(
    bootstrap.pendingRegistration,
  );
  const finishedRef = useRef(false);
  const completionInFlightRef = useRef(false);
  const completionStopSignalRef = useRef(createCompletionStopSignal());
  const completedTodayRef = useRef(todayCount);
  const completedTodayDateRef = useRef(today);

  const completionRef = useRef<() => Promise<void>>(async () => {});
  const phaseRegistrationRef = useRef(
    createSingleFlightPomodoroRegistration(completePomodoroAction),
  );

  function startPhase(
    nextMode: Mode,
    assignedTaskId: string | null,
    cycleTaskId: string | null,
    requestNotificationPermission: boolean,
    nextStatus: string | null = null,
  ) {
    const now = Date.now();
    const seconds = plannedFor(nextMode);
    const endAt = now + seconds * 1000;

    setMode(nextMode);
    setPlannedSeconds(seconds);
    plannedRef.current = seconds;
    endAtRef.current = endAt;
    taskIdRef.current = nextMode === "WORK" ? assignedTaskId : null;
    setTaskId(nextMode === "WORK" ? assignedTaskId : null);
    cycleTaskIdRef.current = cycleTaskId;
    const sessionId = crypto.randomUUID();
    sessionIdRef.current = sessionId;
    activeSegmentsRef.current = [];
    accumulatedActiveSecondsRef.current = 0;
    segmentStartedAtRef.current = now;
    sessionStartedAtRef.current = now;
    finishedRef.current = false;
    setRunning(true);
    setPaused(false);
    setStatus(nextStatus);
    setRemaining(seconds);

    writeStorage({
      mode: nextMode,
      endAt,
      remainingSeconds: seconds,
      plannedSeconds: seconds,
      taskId: nextMode === "WORK" ? assignedTaskId : null,
      sessionId,
      activeSegments: [],
      cycleTaskId,
      accumulatedActiveSeconds: 0,
      segmentStartedAt: now,
      sessionStartedAt: now,
      savedAt: now,
    });

    if (
      requestNotificationPermission &&
      prefs.notificationsEnabled &&
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      void Notification.requestPermission().catch(() => undefined);
    }
  }

  function start() {
    if (pendingRegistrationRef.current) return;
    const assignment = getPomodoroTaskAssignment(
      mode,
      taskIdRef.current,
      cycleTaskIdRef.current,
    );
    startPhase(mode, assignment.taskId, assignment.cycleTaskId, true);
  }

  function persistPendingRegistration(registration: PomodoroPhaseRegistration) {
    pendingRegistrationRef.current = registration;
    setPendingRegistration(registration);
    const savedAt = Date.now();
    writeStorage({
      mode: registration.phase,
      endAt: 0,
      remainingSeconds: Math.max(1, plannedRef.current),
      plannedSeconds: registration.plannedSeconds,
      taskId: registration.phase === "WORK" ? registration.taskId : null,
      sessionId: registration.sessionId,
      activeSegments: registration.activeSegments,
      cycleTaskId: registration.taskId ?? cycleTaskIdRef.current,
      accumulatedActiveSeconds: calculateActualSeconds(registration.activeSegments),
      segmentStartedAt: null,
      sessionStartedAt: registration.startedAt,
      savedAt,
      pendingRegistration: registration,
    });
  }

  async function retryPendingRegistration() {
    const registration = pendingRegistrationRef.current;
    if (!registration || completionInFlightRef.current) return;

    completionInFlightRef.current = true;
    setCompletionPending(true);
    setAbandonPending(!registration.completed);
    const result = await submitPomodoroPhaseRegistration(
      registration,
      phaseRegistrationRef.current,
    );
    if (result.ok) {
      pendingRegistrationRef.current = null;
      // Tras una respuesta incierta, los props pueden ya incluir el commit de
      // la primera solicitud. Recargar evita sumar dos veces las métricas UI.
      clearStorage();
      window.location.reload();
      return;
    } else {
      setStatus(result.error ?? "No se pudo guardar la fase.");
    }
    setCompletionPending(false);
    setAbandonPending(false);
    completionInFlightRef.current = false;
  }

  function pause() {
    if (completionInFlightRef.current) {
      if (completionStopSignalRef.current.getIntent() === null) {
        completionStopSignalRef.current.requestStop("pause");
        setCompletionStopIntent("pause");
        setRunning(false);
        setStatus("Guardando la fase completada; auto-avance detenido por pausa.");
      }
      return;
    }

    const now = Date.now();
    const secondsLeft = endAtRef.current
      ? Math.max(1, Math.ceil((endAtRef.current - now) / 1000))
      : remaining;
    activeSegmentsRef.current = closePomodoroActiveSegment(
      activeSegmentsRef.current,
      segmentStartedAtRef.current,
      now,
    );
    const activeSeconds = calculateActualSeconds(activeSegmentsRef.current);

    accumulatedActiveSecondsRef.current = activeSeconds;
    segmentStartedAtRef.current = null;
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
      taskId: taskIdRef.current,
      sessionId: sessionIdRef.current,
      activeSegments: activeSegmentsRef.current,
      cycleTaskId: cycleTaskIdRef.current,
      accumulatedActiveSeconds: activeSeconds,
      segmentStartedAt: null,
      sessionStartedAt: sessionStartedAtRef.current,
      savedAt: now,
    });
  }

  function resume() {
    const now = Date.now();
    const endAt = now + remaining * 1000;
    // Estados guardados antes de persistir el inicio original no contienen
    // información suficiente; al reanudarlos se fija el primer instante
    // conocido, sin reconstruirlo desde la duración planificada.
    if (sessionStartedAtRef.current === null) {
      sessionStartedAtRef.current = now;
    }
    if (sessionIdRef.current === null) {
      sessionIdRef.current = crypto.randomUUID();
    }

    endAtRef.current = endAt;
    segmentStartedAtRef.current = now;
    finishedRef.current = false;
    setRunning(true);
    setPaused(false);
    setStatus(null);

    writeStorage({
      mode,
      endAt,
      remainingSeconds: remaining,
      plannedSeconds: plannedRef.current,
      taskId: taskIdRef.current,
      sessionId: sessionIdRef.current,
      activeSegments: activeSegmentsRef.current,
      cycleTaskId: cycleTaskIdRef.current,
      accumulatedActiveSeconds: accumulatedActiveSecondsRef.current,
      segmentStartedAt: now,
      sessionStartedAt: sessionStartedAtRef.current,
      savedAt: now,
    });
  }

  function selectMode(nextMode: Mode) {
    if (running || paused || completionInFlightRef.current || pendingRegistrationRef.current) {
      return;
    }

    const seconds = plannedFor(nextMode);
    setMode(nextMode);
    setPlannedSeconds(seconds);
    plannedRef.current = seconds;
    setRemaining(seconds);
    if (nextMode !== "WORK") {
      taskIdRef.current = null;
      setTaskId(null);
    }
  }

  function selectTask(nextTaskId: string | null) {
    if (
      running ||
      paused ||
      completionInFlightRef.current ||
      pendingRegistrationRef.current ||
      mode !== "WORK"
    ) {
      return;
    }

    taskIdRef.current = nextTaskId;
    setTaskId(nextTaskId);
  }

  function cancel() {
    if (completionInFlightRef.current) {
      if (completionStopSignalRef.current.getIntent() === null) {
        completionStopSignalRef.current.requestStop("cancel");
        setCompletionStopIntent("cancel");
        setRunning(false);
        setStatus("Guardando la fase completada; abandono solicitado.");
      }
      return;
    }

    if (!running && !paused) return;
    completionInFlightRef.current = true;
    finishedRef.current = true;
    completionStopSignalRef.current.reset();
    const endedAt = Date.now();
    const startedAt = sessionStartedAtRef.current ?? segmentStartedAtRef.current ?? endedAt;
    const sessionId = sessionIdRef.current ?? crypto.randomUUID();
    const activeSegments = closePomodoroActiveSegment(
      activeSegmentsRef.current,
      segmentStartedAtRef.current,
      endedAt,
    );
    const secondsLeft = running && endAtRef.current
      ? Math.max(1, Math.ceil((endAtRef.current - endedAt) / 1000))
      : remaining;

    sessionIdRef.current = sessionId;
    activeSegmentsRef.current = activeSegments;
    sessionStartedAtRef.current = startedAt;
    segmentStartedAtRef.current = null;
    endAtRef.current = 0;
    const abandonedActiveSeconds = calculateActualSeconds(activeSegments);
    accumulatedActiveSecondsRef.current = abandonedActiveSeconds;
    setRunning(false);
    setPaused(true);
    setRemaining(secondsLeft);
    setCompletionPending(true);
    setAbandonPending(true);
    setStatus("Registrando la fase abandonada…");
    writeStorage({
      mode,
      endAt: 0,
      remainingSeconds: secondsLeft,
      plannedSeconds: plannedRef.current,
      taskId: taskIdRef.current,
      sessionId,
      activeSegments,
      cycleTaskId: cycleTaskIdRef.current,
      accumulatedActiveSeconds: accumulatedActiveSecondsRef.current,
      segmentStartedAt: null,
      sessionStartedAt: startedAt,
      savedAt: endedAt,
    });

    const registration: PomodoroPhaseRegistration = {
      sessionId,
      phase: mode,
      plannedSeconds: plannedRef.current,
      startedAt,
      endedAt,
      activeSegments,
      completed: false,
      taskId: cycleTaskIdRef.current,
    };
    persistPendingRegistration(registration);
    void submitPomodoroPhaseRegistration(registration, phaseRegistrationRef.current)
      .then((result) => {
        if (result.ok) {
          setTotalMin((current) => current + abandonedActiveSeconds / 60);
          pendingRegistrationRef.current = null;
          setPendingRegistration(null);
          taskIdRef.current = null;
          cycleTaskIdRef.current = null;
          sessionIdRef.current = null;
          activeSegmentsRef.current = [];
          accumulatedActiveSecondsRef.current = 0;
          segmentStartedAtRef.current = null;
          sessionStartedAtRef.current = null;
          setTaskId(null);
          setPaused(false);
          clearStorage();
          setStatus("Fase abandonada y registrada.");
          const seconds = plannedFor(mode);
          setPlannedSeconds(seconds);
          plannedRef.current = seconds;
          setRemaining(seconds);
        } else {
          setStatus(result.error ?? "No se pudo guardar la fase abandonada.");
        }
        setCompletionPending(false);
        setAbandonPending(false);
        completionInFlightRef.current = false;
      });
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
      try {
        new Notification(title, { body });
      } catch {
        // La notificación del navegador es best-effort.
      }
    }
  }

  async function handleFinished() {
    if (completionInFlightRef.current) {
      return;
    }
    completionInFlightRef.current = true;
    completionStopSignalRef.current.reset();
    setCompletionPending(true);
    setCompletionStopIntent(null);

    const phase = mode;
    const seconds = plannedRef.current;
    const endedAtTimestamp = Date.now();
    const endedAtDate = new Date(endedAtTimestamp);
    const currentDay = toDateKey(endedAtDate, timeZone);
    const sessionStartedAt =
      sessionStartedAtRef.current ?? segmentStartedAtRef.current ?? endedAtDate.getTime();
    const sessionId = sessionIdRef.current ?? crypto.randomUUID();
    const activeSegments = closePomodoroActiveSegment(
      activeSegmentsRef.current,
      segmentStartedAtRef.current,
      endedAtTimestamp,
    );
    const actualSeconds = calculateActualSeconds(activeSegments);
    sessionIdRef.current = sessionId;
    activeSegmentsRef.current = activeSegments;
    const cycleTaskId = cycleTaskIdRef.current;
    const workStartedDay = phase === "WORK"
      ? toDateKey(new Date(sessionStartedAt), timeZone)
      : null;
    const completedWorkSessionsForNextPhase = getCompletedWorkSessionsTodayAfterCompletion({
      phase,
      completedWorkSessionsToday: completedTodayRef.current,
      countedDay: completedTodayDateRef.current,
      // El intervalo se determina por el día local en que empezó este WORK,
      // aunque su pausa/reanudación haya cruzado la medianoche.
      today: workStartedDay ?? currentDay,
      workStartedDay,
    });
    const completedWorkSessionsToday = getCompletedWorkSessionsTodayAfterCompletion({
      phase,
      completedWorkSessionsToday: completedTodayRef.current,
      countedDay: completedTodayDateRef.current,
      today: currentDay,
      workStartedDay,
    });
    const countWithoutThisPhase = getCompletedWorkSessionsTodayAfterCompletion({
      phase: "SHORT_BREAK",
      completedWorkSessionsToday: completedTodayRef.current,
      countedDay: completedTodayDateRef.current,
      today: currentDay,
      workStartedDay: null,
    });
    const outcome = await finishPomodoroPhase({
      phase,
      autoAdvance: prefs.autoAdvance,
      completedWorkSessionsToday: completedWorkSessionsForNextPhase,
      longBreakInterval: prefs.longBreakInterval,
      cycleTaskId,
      notify: () =>
        notify(
          `${MODE_LABEL[phase]} completado`,
          phase === "WORK" ? "Toca descanso, lo has ganado." : "Es hora de volver al foco.",
        ),
      register: async (assignedTaskId) => {
        const registration: PomodoroPhaseRegistration = {
          sessionId,
          phase,
          plannedSeconds: seconds,
          startedAt: sessionStartedAt,
          endedAt: endedAtTimestamp,
          activeSegments,
          completed: true,
          taskId: assignedTaskId,
        };
        persistPendingRegistration(registration);
        return submitPomodoroPhaseRegistration(registration, phaseRegistrationRef.current);
      },
      canContinue: completionStopSignalRef.current.canContinue,
    });

    const { result } = outcome;
    const stopIntent = completionStopSignalRef.current.getIntent();
    completedTodayDateRef.current = currentDay;
    completedTodayRef.current = result.ok
      ? completedWorkSessionsToday
      : countWithoutThisPhase;
    setCompletedToday(completedTodayRef.current);
    if (result.ok) {
      setTotalMin((current) => current + actualSeconds / 60);
      setTotalDone((current) => current + 1);
    }

    if (result.ok) {
      pendingRegistrationRef.current = null;
      setPendingRegistration(null);
      endAtRef.current = 0;
      accumulatedActiveSecondsRef.current = 0;
      segmentStartedAtRef.current = null;
      sessionStartedAtRef.current = null;
      activeSegmentsRef.current = [];
      sessionIdRef.current = null;
    }

    if (result.ok && outcome.nextMode) {
      const nextMode = outcome.nextMode;
      const nextTaskId = outcome.nextTaskId;
      const nextStatus = `${MODE_LABEL[nextMode]} iniciado automáticamente.`;
      startPhase(
        nextMode,
        nextTaskId,
        cycleTaskId,
        false,
        nextStatus,
      );
    } else {
      setRunning(false);
      setPaused(false);

      if (result.ok) {
        taskIdRef.current = null;
        setTaskId(null);
        clearStorage();
        if (stopIntent === "cancel") {
          cycleTaskIdRef.current = null;
        }
        setStatus(
          stopIntent === "cancel"
            ? "Fase completada registrada; ciclo abandonado."
            : stopIntent === "pause"
              ? "Fase completada registrada; auto-avance detenido por pausa."
              : `${MODE_LABEL[phase]} completado.`,
        );
        if (!prefs.autoAdvance && phase === "WORK") {
          const nextMode = getNextPomodoroPhase("WORK", {
            autoAdvance: true,
            completedWorkSessionsToday: completedWorkSessionsForNextPhase,
            longBreakInterval: prefs.longBreakInterval,
          });
          if (nextMode) {
            setMode(nextMode);
            const secondsForNext = plannedFor(nextMode);
            setPlannedSeconds(secondsForNext);
            plannedRef.current = secondsForNext;
            setRemaining(secondsForNext);
          }
        }
      } else {
        const message = result.error ?? "No se pudo guardar la sesión.";
        setStatus(`${message} El payload se conserva para reintentar.`);
      }
    }

    completionStopSignalRef.current.reset();
    setCompletionStopIntent(null);
    setCompletionPending(false);
    completionInFlightRef.current = false;
  }

  useEffect(() => {
    completionRef.current = handleFinished;
  });

  useEffect(() => {
    if ((!bootstrap.running && !bootstrap.paused) || bootstrap.savedAt > 0) {
      return;
    }

    const savedAt = Date.now();
    const remainingSeconds = bootstrap.running
      ? Math.max(1, Math.ceil((bootstrap.endAt - savedAt) / 1000))
      : bootstrap.remaining;

    // Persiste la migración al primer montaje para que futuras recargas no
    // vuelvan a perder tiempo activo transcurrido desde esta recuperación.
    writeStorage({
      mode: bootstrap.mode,
      endAt: bootstrap.running ? bootstrap.endAt : 0,
      remainingSeconds,
      plannedSeconds: bootstrap.plannedSeconds,
      taskId: bootstrap.taskId,
      sessionId: bootstrap.sessionId,
      activeSegments: bootstrap.activeSegments,
      cycleTaskId: bootstrap.cycleTaskId,
      accumulatedActiveSeconds: bootstrap.accumulatedActiveSeconds,
      segmentStartedAt: bootstrap.running ? bootstrap.segmentStartedAt : null,
      sessionStartedAt: bootstrap.sessionStartedAt,
      savedAt,
    });
  }, [bootstrap]);

  useEffect(() => {
    if (!running && !paused && !pendingRegistrationRef.current && readStorage()) {
      clearStorage();
    }
  }, [running, paused]);

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
            Sesiones <strong className="font-semibold text-foreground">{totalDone}</strong>
            {" · Activo "}
            <strong className="font-semibold text-foreground">{Math.round(totalMin)} min</strong>
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
              disabled={running || paused || Boolean(pendingRegistration)}
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

        {mode === "WORK" && (
          <label className="flex w-full max-w-sm flex-col gap-1 text-sm">
            <span className="font-medium">Tarea (opcional)</span>
            <select
              value={taskId ?? ""}
              onChange={(event) => selectTask(event.target.value || null)}
              disabled={running || paused || Boolean(pendingRegistration)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">Sin tarea asignada</option>
              {taskId && !tasks.some((task) => task.id === taskId) && (
                <option value={taskId}>Tarea asignada (ya no está pendiente)</option>
              )}
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>
        )}

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
          {pendingRegistration ? (
            <Button
              onClick={retryPendingRegistration}
              disabled={completionPending}
              className="min-w-36"
            >
              {completionPending
                ? abandonPending
                  ? "Reintentando abandono…"
                  : "Reintentando registro…"
                : "Reintentar registro"}
            </Button>
          ) : completionPending ? abandonPending ? (
            <p className="text-center text-sm text-muted-foreground" role="status">
              Registrando el abandono de la fase…
            </p>
          ) : completionStopIntent ? (
            <p className="text-center text-sm text-muted-foreground" role="status">
              {completionStopIntent === "pause"
                ? "Pausa solicitada; esperando el registro de la fase completada."
                : "Abandono solicitado; esperando el registro de la fase completada."}
            </p>
          ) : (
            <>
              <Button variant="secondary" onClick={pause} className="min-w-28">
                Pausar
              </Button>
              <Button variant="ghost" onClick={cancel}>
                Abandonar
              </Button>
            </>
          ) : running ? (
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
              <Button variant="ghost" onClick={cancel} disabled={abandonPending}>
                Abandonar
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
