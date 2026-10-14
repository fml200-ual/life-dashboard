import {
  type ActiveTimeSegment,
  getNextPomodoroPhase,
  type PomodoroPhaseRegistration,
  type PomodoroPhase,
} from "@/lib/pomodoro";

type CompletionResult = { ok: boolean; error?: string };
export type { PomodoroPhaseRegistration } from "@/lib/pomodoro";
export type CompletionStopIntent = "pause" | "cancel";

/** WORK adopta la selección nueva; un descanso solo conserva la tarea del ciclo. */
export function getPomodoroTaskAssignment(
  phase: PomodoroPhase,
  selectedTaskId: string | null,
  cycleTaskId: string | null,
): { taskId: string | null; cycleTaskId: string | null } {
  return phase === "WORK"
    ? { taskId: selectedTaskId, cycleTaskId: selectedTaskId }
    : { taskId: null, cycleTaskId };
}

/** Cierra el segmento que estaba corriendo; una fase pausada aporta ninguno. */
export function closePomodoroActiveSegment(
  segments: readonly ActiveTimeSegment[],
  segmentStartedAt: number | null,
  endedAt: number,
): ActiveTimeSegment[] {
  if (
    segmentStartedAt === null ||
    !Number.isFinite(segmentStartedAt) ||
    !Number.isFinite(endedAt) ||
    endedAt <= segmentStartedAt
  ) {
    return [...segments];
  }

  return [...segments, [segmentStartedAt, endedAt]];
}

/** Adapta el estado local al contrato validado por la Server Action. */
export function createPomodoroRegistrationFormData(
  registration: PomodoroPhaseRegistration,
): FormData {
  const formData = new FormData();
  formData.set("id", registration.sessionId);
  formData.set("phase", registration.phase);
  formData.set("plannedSeconds", String(registration.plannedSeconds));
  formData.set("startedAt", new Date(registration.startedAt).toISOString());
  formData.set("endedAt", new Date(registration.endedAt).toISOString());
  formData.set("activeSegments", JSON.stringify(registration.activeSegments));
  formData.set("completed", String(registration.completed));
  if (registration.taskId) formData.set("taskId", registration.taskId);
  return formData;
}

/** Construye un FormData nuevo por intento a partir del payload terminal congelado. */
export async function submitPomodoroPhaseRegistration<T extends CompletionResult>(
  registration: PomodoroPhaseRegistration,
  register: (formData: FormData) => Promise<T>,
): Promise<T | CompletionResult> {
  try {
    return await register(createPomodoroRegistrationFormData(registration));
  } catch {
    return { ok: false, error: "No se pudo guardar la fase." };
  }
}

/** Serializa registros concurrentes: la primera petición determina el resultado. */
export function createSingleFlightPomodoroRegistration<T extends CompletionResult>(
  register: (formData: FormData) => Promise<T>,
): (formData: FormData) => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return (formData) => {
    if (inFlight) return inFlight;

    const current = Promise.resolve()
      .then(() => register(formData))
      .finally(() => {
        if (inFlight === current) inFlight = null;
      });
    inFlight = current;
    return current;
  };
}

/** Señal mutable estable para cancelar solo el auto-avance de un registro en vuelo. */
export function createCompletionStopSignal() {
  let intent: CompletionStopIntent | null = null;

  return {
    requestStop(nextIntent: CompletionStopIntent) {
      intent ??= nextIntent;
    },
    getIntent() {
      return intent;
    },
    canContinue() {
      return intent === null;
    },
    reset() {
      intent = null;
    },
  };
}

/**
 * Notifica y registra una fase terminada, después resuelve el siguiente paso.
 * La notificación es best-effort y los descansos conservan la tarea del ciclo.
 */
export async function finishPomodoroPhase({
  phase,
  autoAdvance,
  completedWorkSessionsToday,
  longBreakInterval,
  cycleTaskId,
  notify,
  register,
  canContinue = () => true,
}: {
  phase: PomodoroPhase;
  autoAdvance: boolean;
  completedWorkSessionsToday: number;
  longBreakInterval: number;
  cycleTaskId: string | null;
  notify: () => void;
  register: (taskId: string | null) => Promise<CompletionResult>;
  canContinue?: () => boolean;
}): Promise<{
  result: CompletionResult;
  nextMode: PomodoroPhase | null;
  nextTaskId: string | null;
}> {
  try {
    notify();
  } catch {
    // Un permiso denegado o una API del navegador fallida no detiene el flujo.
  }

  const result = await register(cycleTaskId);
  const shouldContinue = result.ok && canContinue();
  const nextMode = shouldContinue
    ? getNextPomodoroPhase(phase, {
        autoAdvance,
        completedWorkSessionsToday,
        longBreakInterval,
      })
    : null;

  return {
    result,
    nextMode,
    nextTaskId: nextMode === "WORK" ? cycleTaskId : null,
  };
}
