import {
  getNextPomodoroPhase,
  type PomodoroPhase,
} from "@/lib/pomodoro";

type CompletionResult = { ok: boolean; error?: string };
export type CompletionStopIntent = "pause" | "cancel";

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
 * La notificación es best-effort y el callback de registro recibe taskId solo
 * cuando la fase completada es WORK.
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

  const result = await register(phase === "WORK" ? cycleTaskId : null);
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
