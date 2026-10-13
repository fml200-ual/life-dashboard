import { toDateKey } from "@/lib/date";

export type PomodoroPhase = "WORK" | "SHORT_BREAK" | "LONG_BREAK";

export type StoredPomodoroState = {
  mode: PomodoroPhase;
  endAt: number;
  remainingSeconds: number;
  plannedSeconds: number;
  taskId: string | null;
  /** Tarea del foco actual para poder heredarla tras un descanso automático. */
  cycleTaskId?: string | null;
  accumulatedActiveSeconds: number;
  segmentStartedAt: number | null;
  /** Inicio original de esta fase; no cambia al pausar ni al reanudar. */
  sessionStartedAt: number | null;
  savedAt: number;
};

export type RecoveredPomodoroState = StoredPomodoroState & {
  activeSeconds: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Cuenta los focos WORK completados que comenzaron en `today` según la zona
 * horaria indicada. `today` y la zona se resuelven fuera de esta función para
 * que el resultado no dependa del reloj ni de la zona del servidor.
 */
export function countCompletedWorkSessionsForDay(
  sessions: readonly {
    phase: string;
    completed: boolean;
    startedAt: Date;
  }[],
  today: string,
  timeZone: string,
): number {
  return sessions.reduce((count, session) => {
    if (
      session.phase === "WORK" &&
      session.completed &&
      toDateKey(session.startedAt, timeZone) === today
    ) {
      return count + 1;
    }

    return count;
  }, 0);
}

export function getNextPomodoroPhase(
  completedPhase: PomodoroPhase,
  options: {
    autoAdvance: boolean;
    /** Número de WORK completados hoy, incluido `completedPhase` si es WORK. */
    completedWorkSessionsToday: number;
    longBreakInterval: number;
  },
): PomodoroPhase | null {
  if (!options.autoAdvance) {
    return null;
  }

  if (completedPhase !== "WORK") {
    return "WORK";
  }

  const { completedWorkSessionsToday, longBreakInterval } = options;
  const intervalIsValid = Number.isInteger(longBreakInterval) && longBreakInterval > 0;
  const shouldTakeLongBreak =
    intervalIsValid &&
    Number.isInteger(completedWorkSessionsToday) &&
    completedWorkSessionsToday > 0 &&
    completedWorkSessionsToday % longBreakInterval === 0;

  return shouldTakeLongBreak ? "LONG_BREAK" : "SHORT_BREAK";
}

/**
 * Actualiza el contador local de WORK tras guardar una fase. Un contador leído
 * para otro día se reinicia; el foco solo cuenta si su clave local de inicio es
 * el día que se está evaluando.
 */
export function getCompletedWorkSessionsTodayAfterCompletion({
  phase,
  completedWorkSessionsToday,
  countedDay,
  today,
  workStartedDay,
}: {
  phase: PomodoroPhase;
  completedWorkSessionsToday: number;
  countedDay: string;
  today: string;
  workStartedDay: string | null;
}): number {
  const previousCount = countedDay === today && Number.isInteger(completedWorkSessionsToday)
    ? Math.max(0, completedWorkSessionsToday)
    : 0;

  return previousCount + (phase === "WORK" && workStartedDay === today ? 1 : 0);
}

/**
 * Segundos que aportan las sesiones al total visible. Los registros legacy
 * tienen `actualSeconds = 0` por el default de migración y conservan el
 * comportamiento histórico usando su duración planificada.
 */
export function getPomodoroSessionSeconds(session: {
  phase: string;
  actualSeconds: number;
  plannedSeconds: number;
}): number {
  if (session.phase !== "WORK") {
    return 0;
  }

  const seconds = Number.isInteger(session.actualSeconds) && session.actualSeconds > 0
    ? session.actualSeconds
    : session.plannedSeconds;
  return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}

/**
 * Devuelve el tiempo activo acumulado, sin incluir pausas. Cuando no hay
 * `segmentStartedAt` la sesión está pausada y solo se conserva el acumulado.
 * Los milisegundos parciales no llegan a constituir un segundo completo.
 */
export function calculateActiveSeconds(
  accumulatedSeconds: number,
  segmentStartedAt: number | null,
  now: number,
): number {
  const accumulated = Number.isFinite(accumulatedSeconds)
    ? Math.max(0, Math.floor(accumulatedSeconds))
    : 0;

  if (segmentStartedAt === null || !Number.isFinite(segmentStartedAt) || !Number.isFinite(now)) {
    return accumulated;
  }

  const elapsedSeconds = Math.floor(Math.max(0, now - segmentStartedAt) / 1000);
  return accumulated + elapsedSeconds;
}

/**
 * Determina si una fase que estaba corriendo sigue siendo recuperable. Los
 * argumentos temporales son explícitos; una fase vencida o de antigüedad igual
 * o superior al máximo se descarta y no debe encadenarse otra fase.
 */
export function canResumePomodoro(
  endAt: number,
  now: number,
  maxAgeMs = DAY_MS,
): boolean {
  return (
    Number.isFinite(endAt) &&
    Number.isFinite(now) &&
    Number.isFinite(maxAgeMs) &&
    maxAgeMs > 0 &&
    endAt > now &&
    endAt - now < maxAgeMs
  );
}

export function serializePomodoroState(state: StoredPomodoroState): string {
  return JSON.stringify(state);
}

/**
 * Lee estados nuevos y los estados previos al seguimiento de tareas/tiempo.
 * Los estados antiguos no tienen fecha de guardado y no se expiran por pausa.
 */
export function parsePomodoroState(raw: string): StoredPomodoroState | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") {
      return null;
    }

    const stored = value as Partial<StoredPomodoroState>;
    if (
      stored.mode !== "WORK" &&
      stored.mode !== "SHORT_BREAK" &&
      stored.mode !== "LONG_BREAK"
    ) {
      return null;
    }
    if (
      !Number.isFinite(stored.endAt) ||
      !Number.isInteger(stored.remainingSeconds) ||
      (stored.remainingSeconds ?? 0) <= 0 ||
      !Number.isInteger(stored.plannedSeconds) ||
      (stored.plannedSeconds ?? 0) <= 0
    ) {
      return null;
    }

    const endAt = stored.endAt as number;
    const plannedSeconds = stored.plannedSeconds as number;
    const remainingSeconds = stored.remainingSeconds as number;
    const taskId = typeof stored.taskId === "string" && stored.taskId
      ? stored.taskId
      : null;
    const cycleTaskId = typeof stored.cycleTaskId === "string" && stored.cycleTaskId
      ? stored.cycleTaskId
      : taskId;
    const hasActiveSeconds = Number.isInteger(stored.accumulatedActiveSeconds);
    const accumulatedActiveSeconds = hasActiveSeconds
      ? Math.max(0, stored.accumulatedActiveSeconds as number)
      : Math.min(plannedSeconds, Math.max(0, plannedSeconds - remainingSeconds));
    const segmentStartedAt = Number.isFinite(stored.segmentStartedAt)
      ? (stored.segmentStartedAt as number)
      : null;
    const sessionStartedAt = Number.isFinite(stored.sessionStartedAt)
      ? (stored.sessionStartedAt as number)
      : null;
    const savedAt = Number.isFinite(stored.savedAt) ? (stored.savedAt as number) : 0;

    return {
      mode: stored.mode,
      endAt,
      remainingSeconds,
      plannedSeconds,
      taskId,
      cycleTaskId,
      accumulatedActiveSeconds,
      segmentStartedAt,
      sessionStartedAt,
      savedAt,
    };
  } catch {
    return null;
  }
}

export function recoverPomodoroState(
  stored: StoredPomodoroState | null,
  now: number,
  maxAgeMs = DAY_MS,
): RecoveredPomodoroState | null {
  if (!stored || !Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    return null;
  }

  const savedStateIsFresh =
    stored.savedAt <= 0 ||
    (now >= stored.savedAt && now - stored.savedAt < maxAgeMs);
  if (!savedStateIsFresh) {
    return null;
  }

  const running = canResumePomodoro(stored.endAt, now, maxAgeMs);
  const paused = stored.endAt === 0 && stored.remainingSeconds > 0;
  if (!running && !paused) {
    return null;
  }

  const isLegacyRunningState =
    running &&
    stored.savedAt <= 0 &&
    stored.segmentStartedAt === null &&
    stored.sessionStartedAt === null;

  return {
    ...stored,
    // Los estados antiguos no guardaban el comienzo del tramo. Empezamos a
    // contar el tramo actual desde la recuperación, sin reconstruir el inicio
    // original de la sesión a partir de su duración planificada.
    segmentStartedAt: isLegacyRunningState ? now : stored.segmentStartedAt,
    activeSeconds: calculateActiveSeconds(
      stored.accumulatedActiveSeconds,
      running
        ? isLegacyRunningState
          ? now
          : stored.segmentStartedAt
        : null,
      now,
    ),
  };
}
