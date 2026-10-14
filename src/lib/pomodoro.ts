import { toDateKey } from "@/lib/date";

export type PomodoroPhase = "WORK" | "SHORT_BREAK" | "LONG_BREAK";
export type ActiveTimeSegment = readonly [startedAt: number, endedAt: number];
export type PomodoroPhaseRegistration = {
  sessionId: string;
  phase: PomodoroPhase;
  plannedSeconds: number;
  startedAt: number;
  endedAt: number;
  activeSegments: readonly ActiveTimeSegment[];
  completed: boolean;
  taskId: string | null;
};

export const MAX_TASK_SECONDS_PER_PHASE = 28_800;

export type StoredPomodoroState = {
  mode: PomodoroPhase;
  endAt: number;
  remainingSeconds: number;
  plannedSeconds: number;
  taskId: string | null;
  /** UUID estable de la fase; los estados anteriores a T003 no lo tienen. */
  sessionId?: string | null;
  /** Tramos activos ya cerrados, expresados como pares de epoch-ms. */
  activeSegments?: readonly ActiveTimeSegment[];
  /** Tarea del foco actual para poder heredarla tras un descanso automático. */
  cycleTaskId?: string | null;
  accumulatedActiveSeconds: number;
  segmentStartedAt: number | null;
  /** Inicio original de esta fase; no cambia al pausar ni al reanudar. */
  sessionStartedAt: number | null;
  savedAt: number;
  /** Payload terminal inmutable que se conserva hasta confirmar su registro. */
  pendingRegistration?: PomodoroPhaseRegistration | null;
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
  completed: boolean;
}): number {
  if (Number.isFinite(session.actualSeconds) && session.actualSeconds > 0) {
    return Math.floor(session.actualSeconds);
  }

  if (
    session.phase === "WORK" &&
    session.completed &&
    session.actualSeconds === 0 &&
    Number.isFinite(session.plannedSeconds)
  ) {
    return Math.max(0, Math.floor(session.plannedSeconds));
  }

  return 0;
}

/** Resume las métricas Pomodoro sin mezclar duración activa y objetivos. */
export function getPomodoroStatistics(
  sessions: readonly {
    phase: string;
    completed: boolean;
    actualSeconds: number;
    plannedSeconds: number;
    startedAt: Date;
  }[],
  today: string,
  timeZone: string,
): {
  totalActiveSeconds: number;
  completedWorkSessionsToday: number;
  todayActiveWorkSeconds: number;
} {
  return {
    totalActiveSeconds: sessions.reduce(
      (total, session) => total + getPomodoroSessionSeconds(session),
      0,
    ),
    completedWorkSessionsToday: countCompletedWorkSessionsForDay(
      sessions,
      today,
      timeZone,
    ),
    todayActiveWorkSeconds: sessions.reduce((total, session) => {
      if (
        session.phase !== "WORK" ||
        toDateKey(session.startedAt, timeZone) !== today
      ) {
        return total;
      }

      return total + getPomodoroSessionSeconds(session);
    }, 0),
  };
}

/**
 * Comprueba que los intervalos activos estén cronológicamente ordenados,
 * dentro de la fase y no se solapen. Los extremos iguales entre segmentos son
 * válidos; un segmento individual debe tener duración positiva.
 */
export function isValidActiveSegments(
  sessionStartedAt: number,
  sessionEndedAt: number,
  segments: readonly ActiveTimeSegment[],
): boolean {
  if (
    !Number.isFinite(sessionStartedAt) ||
    !Number.isFinite(sessionEndedAt) ||
    sessionEndedAt < sessionStartedAt ||
    !Array.isArray(segments)
  ) {
    return false;
  }

  let previousEndedAt = sessionStartedAt;
  for (const segment of segments) {
    if (
      !Array.isArray(segment) ||
      segment.length !== 2 ||
      !Number.isFinite(segment[0]) ||
      !Number.isFinite(segment[1])
    ) {
      return false;
    }

    const [startedAt, endedAt] = segment;
    if (
      startedAt < sessionStartedAt ||
      endedAt > sessionEndedAt ||
      startedAt < previousEndedAt ||
      endedAt <= startedAt
    ) {
      return false;
    }
    previousEndedAt = endedAt;
  }

  return true;
}

/** Suma los milisegundos activos y trunca una sola vez a segundos completos. */
export function calculateActualSeconds(
  segments: readonly ActiveTimeSegment[],
): number {
  const totalMilliseconds = segments.reduce((total, [startedAt, endedAt]) => {
    const duration = endedAt - startedAt;
    return Number.isFinite(duration) && duration > 0 ? total + duration : total;
  }, 0);

  return Math.floor(totalMilliseconds / 1000);
}

/** Segundos de pared imputables a una tarea, con tope independiente por fase. */
export function calculateTaskWallSeconds(
  startedAt: number,
  endedAt: number,
): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) {
    return 0;
  }

  return Math.min(
    MAX_TASK_SECONDS_PER_PHASE,
    Math.floor((endedAt - startedAt) / 1000),
  );
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

function isValidPendingRegistration(value: unknown): value is PomodoroPhaseRegistration {
  if (!value || typeof value !== "object") return false;
  const registration = value as Partial<PomodoroPhaseRegistration>;
  if (
    typeof registration.sessionId !== "string" ||
    !UUID_PATTERN.test(registration.sessionId) ||
    (registration.phase !== "WORK" &&
      registration.phase !== "SHORT_BREAK" &&
      registration.phase !== "LONG_BREAK") ||
    !Number.isSafeInteger(registration.plannedSeconds) ||
    (registration.plannedSeconds ?? 0) <= 0 ||
    !Number.isSafeInteger(registration.startedAt) ||
    !Number.isSafeInteger(registration.endedAt) ||
    (registration.endedAt ?? 0) < (registration.startedAt ?? 0) ||
    typeof registration.completed !== "boolean" ||
    !(registration.taskId === null || typeof registration.taskId === "string") ||
    !Array.isArray(registration.activeSegments) ||
    !isValidActiveSegments(
      registration.startedAt as number,
      registration.endedAt as number,
      registration.activeSegments,
    ) ||
    (registration.completed && calculateActualSeconds(registration.activeSegments) < 1)
  ) {
    return false;
  }

  return true;
}

function isValidStoredActiveSegments(
  value: unknown,
  sessionStartedAt: number | null,
  segmentStartedAt: number | null,
  savedAt: number,
): value is readonly ActiveTimeSegment[] {
  if (!Array.isArray(value)) {
    return false;
  }

  let previousEndedAt = sessionStartedAt ?? Number.NEGATIVE_INFINITY;
  for (const segment of value) {
    if (
      !Array.isArray(segment) ||
      segment.length !== 2 ||
      !Number.isSafeInteger(segment[0]) ||
      !Number.isSafeInteger(segment[1])
    ) {
      return false;
    }

    const [startedAt, endedAt] = segment;
    if (
      startedAt < previousEndedAt ||
      endedAt <= startedAt ||
      (savedAt > 0 && endedAt > savedAt) ||
      (segmentStartedAt !== null && endedAt > segmentStartedAt)
    ) {
      return false;
    }
    previousEndedAt = endedAt;
  }

  return true;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    const sessionId = stored.sessionId === undefined || stored.sessionId === null
      ? null
      : typeof stored.sessionId === "string" && UUID_PATTERN.test(stored.sessionId)
        ? stored.sessionId
        : null;
    if (
      stored.sessionId !== undefined &&
      stored.sessionId !== null &&
      sessionId === null
    ) {
      return null;
    }

    const activeSegments = stored.activeSegments === undefined ? [] : stored.activeSegments;
    if (!isValidStoredActiveSegments(
      activeSegments,
      sessionStartedAt,
      segmentStartedAt,
      savedAt,
    )) {
      return null;
    }

    const pendingRegistration = stored.pendingRegistration === undefined ||
      stored.pendingRegistration === null
      ? null
      : isValidPendingRegistration(stored.pendingRegistration)
        ? stored.pendingRegistration
        : undefined;
    if (pendingRegistration === undefined) return null;

    return {
      mode: stored.mode,
      endAt,
      remainingSeconds,
      plannedSeconds,
      taskId,
      sessionId,
      activeSegments,
      cycleTaskId,
      accumulatedActiveSeconds,
      segmentStartedAt,
      sessionStartedAt,
      savedAt,
      ...(pendingRegistration ? { pendingRegistration } : {}),
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
