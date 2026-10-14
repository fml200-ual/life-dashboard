import { describe, expect, it, vi } from "vitest";

import {
  createCompletionStopSignal,
  closePomodoroActiveSegment,
  createPomodoroRegistrationFormData,
  createSingleFlightPomodoroRegistration,
  finishPomodoroPhase,
  getPomodoroTaskAssignment,
  submitPomodoroPhaseRegistration,
} from "@/lib/pomodoro-completion";
import {
  parsePomodoroState,
  serializePomodoroState,
  type StoredPomodoroState,
} from "@/lib/pomodoro";

describe("finishPomodoroPhase", () => {
  const common = {
    autoAdvance: true,
    completedWorkSessionsToday: 1,
    longBreakInterval: 4,
    cycleTaskId: "task-1",
  };

  it("notifica el fin de WORK y encadena un descanso conservando su tarea de ciclo", async () => {
    const notify = vi.fn();
    const register = vi.fn(async () => ({ ok: true }));

    const result = await finishPomodoroPhase({
      ...common,
      phase: "WORK",
      notify,
      register,
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith("task-1");
    expect(result).toEqual({
      result: { ok: true },
      nextMode: "SHORT_BREAK",
      nextTaskId: null,
    });
  });

  it("registra los descansos con la tarea heredada y encadena WORK con ella", async () => {
    const notify = vi.fn();
    const register = vi.fn(async () => ({ ok: true }));

    const result = await finishPomodoroPhase({
      ...common,
      phase: "LONG_BREAK",
      notify,
      register,
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith("task-1");
    expect(result).toEqual({
      result: { ok: true },
      nextMode: "WORK",
      nextTaskId: "task-1",
    });
  });

  it("un descanso iniciado manualmente hereda la tarea del ciclo, sin asignarla a WORK", () => {
    expect(getPomodoroTaskAssignment("SHORT_BREAK", null, "task-1")).toEqual({
      taskId: null,
      cycleTaskId: "task-1",
    });
    expect(getPomodoroTaskAssignment("WORK", "task-2", "task-1")).toEqual({
      taskId: "task-2",
      cycleTaskId: "task-2",
    });
  });

  it("notifica al finalizar también un descanso corto", async () => {
    const notify = vi.fn();

    const result = await finishPomodoroPhase({
      ...common,
      phase: "SHORT_BREAK",
      notify,
      register: async () => ({ ok: true }),
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(result.nextMode).toBe("WORK");
    expect(result.nextTaskId).toBe("task-1");
  });

  it("crea el contrato de registro completo para finalizar y abandonar una fase", () => {
    const commonPayload = {
      sessionId: "123e4567-e89b-42d3-a456-426614174000",
      phase: "SHORT_BREAK" as const,
      plannedSeconds: 300,
      startedAt: 1_800_000_000_000,
      endedAt: 1_800_000_300_000,
      activeSegments: [[1_800_000_000_000, 1_800_000_030_500]] as const,
      taskId: "task-1",
    };

    const completed = createPomodoroRegistrationFormData({
      ...commonPayload,
      completed: true,
    });
    expect(Object.fromEntries(completed.entries())).toEqual({
      id: commonPayload.sessionId,
      phase: "SHORT_BREAK",
      plannedSeconds: "300",
      startedAt: new Date(commonPayload.startedAt).toISOString(),
      endedAt: new Date(commonPayload.endedAt).toISOString(),
      activeSegments: JSON.stringify(commonPayload.activeSegments),
      completed: "true",
      taskId: "task-1",
    });

    const abandoned = createPomodoroRegistrationFormData({
      ...commonPayload,
      endedAt: commonPayload.startedAt,
      activeSegments: [],
      taskId: null,
      completed: false,
    });
    expect(Object.fromEntries(abandoned.entries())).toMatchObject({
      id: commonPayload.sessionId,
      phase: "SHORT_BREAK",
      endedAt: new Date(commonPayload.startedAt).toISOString(),
      activeSegments: "[]",
      completed: "false",
    });
    expect(abandoned.has("taskId")).toBe(false);
    expect(abandoned.has("actualSeconds")).toBe(false);
  });

  it("reintenta tras resultado incierto con el mismo payload terminal e ID", async () => {
    const registration = {
      sessionId: "123e4567-e89b-42d3-a456-426614174000",
      phase: "WORK" as const,
      plannedSeconds: 1_500,
      startedAt: 1_800_000_000_000,
      endedAt: 1_800_000_043_250,
      activeSegments: [[1_800_000_000_000, 1_800_000_013_250]] as const,
      completed: true,
      taskId: "task-1",
    };
    const requests: Array<Array<[string, FormDataEntryValue]>> = [];
    const register = vi.fn(async (formData: FormData) => {
      requests.push(Array.from(formData.entries()));
      if (requests.length === 1) {
        throw new Error("respuesta perdida tras confirmar en servidor");
      }
      return { ok: true };
    });

    await expect(submitPomodoroPhaseRegistration(registration, register)).resolves.toEqual({
      ok: false,
      error: "No se pudo guardar la fase.",
    });
    await expect(submitPomodoroPhaseRegistration(registration, register)).resolves.toEqual({
      ok: true,
    });

    expect(register).toHaveBeenCalledTimes(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(Object.fromEntries(requests[1])).toMatchObject({
      id: registration.sessionId,
      phase: "WORK",
      endedAt: new Date(registration.endedAt).toISOString(),
      activeSegments: JSON.stringify(registration.activeSegments),
      completed: "true",
      taskId: "task-1",
    });
  });

  it("reintenta un abandono pausado tras recarga con el payload terminal exacto", async () => {
    const registration = {
      sessionId: "123e4567-e89b-42d3-a456-426614174000",
      phase: "WORK" as const,
      plannedSeconds: 1_500,
      startedAt: 1_800_000_000_000,
      endedAt: 1_800_000_421_375,
      activeSegments: [
        [1_800_000_000_000, 1_800_000_060_250],
        [1_800_000_300_500, 1_800_000_360_750],
      ] as const,
      completed: false,
      taskId: "task-1",
    };
    const storedState: StoredPomodoroState = {
      mode: "WORK",
      endAt: 0,
      remainingSeconds: 1_079,
      plannedSeconds: registration.plannedSeconds,
      taskId: registration.taskId,
      sessionId: registration.sessionId,
      activeSegments: registration.activeSegments,
      cycleTaskId: registration.taskId,
      accumulatedActiveSeconds: 120,
      segmentStartedAt: null,
      sessionStartedAt: registration.startedAt,
      savedAt: registration.endedAt,
      pendingRegistration: registration,
    };
    const serializedState = serializePomodoroState(storedState);
    const requests: Array<Array<[string, FormDataEntryValue]>> = [];
    const register = vi.fn(async (formData: FormData) => {
      requests.push(Array.from(formData.entries()));
      if (requests.length === 1) {
        throw new Error("respuesta perdida tras confirmar en servidor");
      }
      return { ok: true };
    });

    await expect(submitPomodoroPhaseRegistration(registration, register)).resolves.toEqual({
      ok: false,
      error: "No se pudo guardar la fase.",
    });

    const restoredState = parsePomodoroState(serializedState);
    expect(restoredState).not.toBeNull();
    const recoveredRegistration = restoredState!.pendingRegistration!;
    await expect(
      submitPomodoroPhaseRegistration(recoveredRegistration, register),
    ).resolves.toEqual({ ok: true });

    expect(register).toHaveBeenCalledTimes(2);
    expect(requests[1]).toEqual(requests[0]);
    expect(Object.fromEntries(requests[0])).toEqual({
      id: registration.sessionId,
      phase: registration.phase,
      plannedSeconds: String(registration.plannedSeconds),
      startedAt: new Date(registration.startedAt).toISOString(),
      endedAt: new Date(registration.endedAt).toISOString(),
      activeSegments: JSON.stringify(registration.activeSegments),
      completed: "false",
      taskId: registration.taskId,
    });
    expect(Object.fromEntries(requests[1])).toEqual(Object.fromEntries(requests[0]));
    expect(recoveredRegistration).not.toBe(registration);
    expect(recoveredRegistration).toEqual(registration);
    expect(recoveredRegistration.endedAt).toBe(registration.endedAt);
  });

  it("cierra solo el tramo activo y no inventa segmentos al abandonar pausado", () => {
    expect(closePomodoroActiveSegment([[1_000, 2_000]], 3_000, 4_500)).toEqual([
      [1_000, 2_000],
      [3_000, 4_500],
    ]);
    expect(closePomodoroActiveSegment([[1_000, 2_000]], null, 4_500)).toEqual([
      [1_000, 2_000],
    ]);
    expect(closePomodoroActiveSegment([], 3_000, 3_000)).toEqual([]);
  });

  it("comparte una sola solicitud si completar y abandonar intentan registrar a la vez", async () => {
    let resolveRegistration!: (result: { ok: boolean }) => void;
    const register = vi.fn(() => new Promise<{ ok: boolean }>((resolve) => {
      resolveRegistration = resolve;
    }));
    const submitOnce = createSingleFlightPomodoroRegistration(register);
    const completedPayload = new FormData();
    completedPayload.set("completed", "true");
    const abandonedPayload = new FormData();
    abandonedPayload.set("completed", "false");

    const completion = submitOnce(completedPayload);
    const abandonment = submitOnce(abandonedPayload);
    await Promise.resolve();
    expect(register).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(completedPayload);

    resolveRegistration({ ok: true });
    await expect(Promise.all([completion, abandonment])).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);
  });

  it("elige descanso largo en el intervalo exacto y sigue tras el descanso", async () => {
    const register = vi.fn(async () => ({ ok: true }));

    const workResult = await finishPomodoroPhase({
      ...common,
      phase: "WORK",
      completedWorkSessionsToday: 4,
      notify: vi.fn(),
      register,
    });
    const breakResult = await finishPomodoroPhase({
      ...common,
      phase: "LONG_BREAK",
      notify: vi.fn(),
      register,
    });

    expect(workResult.nextMode).toBe("LONG_BREAK");
    expect(breakResult.nextMode).toBe("WORK");
  });

  it("continúa aunque el permiso de notificación esté denegado o falle el navegador", async () => {
    const register = vi.fn(async () => ({ ok: true }));

    const result = await finishPomodoroPhase({
      ...common,
      phase: "SHORT_BREAK",
      notify: () => {
        throw new Error("Notification permission denied");
      },
      register,
    });

    expect(register).toHaveBeenCalledOnce();
    expect(result.nextMode).toBe("WORK");
  });

  it("no encadena con auto-avance apagado, pausa, abandono o fallo de registro", async () => {
    const register = vi.fn(async () => ({ ok: true }));
    const base = {
      ...common,
      phase: "WORK" as const,
      notify: vi.fn(),
      register,
    };

    const disabled = await finishPomodoroPhase({ ...base, autoAdvance: false });
    const paused = await finishPomodoroPhase({ ...base, canContinue: () => false });
    const abandoned = await finishPomodoroPhase({ ...base, canContinue: () => false });
    const failed = await finishPomodoroPhase({
      ...base,
      register: async () => ({ ok: false, error: "No se pudo guardar" }),
    });

    expect(disabled.nextMode).toBeNull();
    expect(paused.nextMode).toBeNull();
    expect(abandoned.nextMode).toBeNull();
    expect(failed.nextMode).toBeNull();
  });

  it.each([
    ["pausa", "pause"],
    ["abandono", "cancel"],
  ] as const)(
    "respeta una solicitud de %s durante el registro en vuelo y conserva el registro enviado",
    async (_label, intent) => {
      let resolveRegistration!: (result: { ok: boolean }) => void;
      const stopSignal = createCompletionStopSignal();
      const registration = new Promise<{ ok: boolean }>((resolve) => {
        resolveRegistration = resolve;
      });
      const register = vi.fn(() => registration);
      const flow = finishPomodoroPhase({
        ...common,
        phase: "WORK",
        notify: vi.fn(),
        register,
        // La misma señal estable que usan los botones consulta el estado
        // actualizado después de que resuelva la acción, no una captura vieja.
        canContinue: stopSignal.canContinue,
      });

      expect(register).toHaveBeenCalledOnce();
      expect(register).toHaveBeenCalledWith("task-1");

      stopSignal.requestStop(intent);
      resolveRegistration({ ok: true });
      const outcome = await flow;

      expect(outcome.result).toEqual({ ok: true });
      expect(outcome.nextMode).toBeNull();
      expect(outcome.nextTaskId).toBeNull();
      expect(stopSignal.getIntent()).toBe(intent);
      // El registro ya enviado se conserva; no hay una segunda llamada ni
      // rollback destructivo por pausar/abandonar durante la espera.
      expect(register).toHaveBeenCalledOnce();
    },
  );
});
