import { describe, expect, it, vi } from "vitest";

import {
  createCompletionStopSignal,
  finishPomodoroPhase,
} from "@/lib/pomodoro-completion";

describe("finishPomodoroPhase", () => {
  const common = {
    autoAdvance: true,
    completedWorkSessionsToday: 1,
    longBreakInterval: 4,
    cycleTaskId: "task-1",
  };

  it("notifica el fin de WORK y encadena un descanso sin asociarle la tarea", async () => {
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

  it("notifica el fin de descansos y encadena WORK heredando la tarea", async () => {
    const notify = vi.fn();
    const register = vi.fn(async () => ({ ok: true }));

    const result = await finishPomodoroPhase({
      ...common,
      phase: "LONG_BREAK",
      notify,
      register,
    });

    expect(notify).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(null);
    expect(result).toEqual({
      result: { ok: true },
      nextMode: "WORK",
      nextTaskId: "task-1",
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
