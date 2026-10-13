import { describe, expect, it } from "vitest";
import { toDateKey } from "@/lib/date";

import {
  calculateActiveSeconds,
  canResumePomodoro,
  countCompletedWorkSessionsForDay,
  getNextPomodoroPhase,
  getCompletedWorkSessionsTodayAfterCompletion,
  getPomodoroSessionSeconds,
  parsePomodoroState,
  recoverPomodoroState,
  serializePomodoroState,
  type PomodoroPhase,
} from "@/lib/pomodoro";

describe("countCompletedWorkSessionsForDay", () => {
  const timezone = "America/Los_Angeles";

  it("cuenta solo sesiones WORK completadas que empezaron en el día local explícito", () => {
    const sessions = [
      { phase: "WORK", completed: true, startedAt: new Date("2026-10-13T06:30:00Z") },
      { phase: "SHORT_BREAK", completed: true, startedAt: new Date("2026-10-13T07:00:00Z") },
      { phase: "WORK", completed: false, startedAt: new Date("2026-10-13T08:00:00Z") },
      { phase: "WORK", completed: true, startedAt: new Date("2026-10-13T06:45:00Z") },
    ];

    expect(
      countCompletedWorkSessionsForDay(sessions, "2026-10-12", timezone),
    ).toBe(2);
    expect(
      countCompletedWorkSessionsForDay(sessions, "2026-10-13", timezone),
    ).toBe(0);
  });

  it("cambia de día local a medianoche sin usar el día UTC", () => {
    const sessions = [
      { phase: "WORK", completed: true, startedAt: new Date("2026-10-13T06:59:59Z") },
      { phase: "WORK", completed: true, startedAt: new Date("2026-10-13T07:00:00Z") },
    ];

    expect(
      countCompletedWorkSessionsForDay(sessions, "2026-10-12", timezone),
    ).toBe(1);
    expect(
      countCompletedWorkSessionsForDay(sessions, "2026-10-13", timezone),
    ).toBe(1);
  });

  it("devuelve cero si no hay sesiones WORK completadas en el día", () => {
    expect(
      countCompletedWorkSessionsForDay(
        [{ phase: "SHORT_BREAK", completed: true, startedAt: new Date("2026-10-13T12:00:00Z") }],
        "2026-10-13",
        "UTC",
      ),
    ).toBe(0);
  });
});

describe("getNextPomodoroPhase", () => {
  const getNext = (
    phase: PomodoroPhase,
    completedWorkSessionsToday: number,
    autoAdvance = true,
  ) =>
    getNextPomodoroPhase(phase, {
      autoAdvance,
      completedWorkSessionsToday,
      longBreakInterval: 4,
    });

  it("no encadena fases con el auto-avance desactivado", () => {
    expect(getNext("WORK", 1, false)).toBeNull();
    expect(getNext("SHORT_BREAK", 1, false)).toBeNull();
  });

  it("pasa de WORK a descanso corto antes del intervalo y largo justo al alcanzarlo", () => {
    expect(getNext("WORK", 3)).toBe("SHORT_BREAK");
    expect(getNext("WORK", 4)).toBe("LONG_BREAK");
  });

  it("pasa de cualquier descanso a WORK para continuar el ciclo", () => {
    expect(getNext("SHORT_BREAK", 4)).toBe("WORK");
    expect(getNext("LONG_BREAK", 4)).toBe("WORK");
  });

  it("continúa ciclos completos, incluidos focos posteriores al descanso largo", () => {
    let phase: PomodoroPhase = "WORK";
    let completedWorkSessionsToday = 0;
    const cycle: PomodoroPhase[] = [];

    for (let i = 0; i < 8; i += 1) {
      if (phase === "WORK") {
        completedWorkSessionsToday += 1;
      }
      cycle.push(phase);
      phase = getNextPomodoroPhase(phase, {
        autoAdvance: true,
        completedWorkSessionsToday,
        longBreakInterval: 4,
      })!;
    }

    expect(cycle).toEqual([
      "WORK",
      "SHORT_BREAK",
      "WORK",
      "SHORT_BREAK",
      "WORK",
      "SHORT_BREAK",
      "WORK",
      "LONG_BREAK",
    ]);
    expect(phase).toBe("WORK");
  });

  it("usa el intervalo como múltiplo y protege valores de intervalo inválidos", () => {
    expect(
      getNextPomodoroPhase("WORK", {
        autoAdvance: true,
        completedWorkSessionsToday: 8,
        longBreakInterval: 4,
      }),
    ).toBe("LONG_BREAK");
    expect(
      getNextPomodoroPhase("WORK", {
        autoAdvance: true,
        completedWorkSessionsToday: 4,
        longBreakInterval: 0,
      }),
    ).toBe("SHORT_BREAK");
  });
});

describe("getCompletedWorkSessionsTodayAfterCompletion", () => {
  it("reinicia el conteo al cambiar de día local antes de evaluar el siguiente intervalo", () => {
    expect(
      getCompletedWorkSessionsTodayAfterCompletion({
        phase: "WORK",
        completedWorkSessionsToday: 3,
        countedDay: "2026-10-12",
        today: "2026-10-13",
        workStartedDay: "2026-10-13",
      }),
    ).toBe(1);
  });

  it("no añade al conteo de hoy un WORK que comenzó el día local anterior", () => {
    expect(
      getCompletedWorkSessionsTodayAfterCompletion({
        phase: "WORK",
        completedWorkSessionsToday: 3,
        countedDay: "2026-10-13",
        today: "2026-10-14",
        workStartedDay: "2026-10-13",
      }),
    ).toBe(0);
  });

  it("no cuenta los descansos como focos WORK", () => {
    expect(
      getCompletedWorkSessionsTodayAfterCompletion({
        phase: "LONG_BREAK",
        completedWorkSessionsToday: 3,
        countedDay: "2026-10-13",
        today: "2026-10-13",
        workStartedDay: null,
      }),
    ).toBe(3);
  });
});

describe("calculateActiveSeconds", () => {
  it("suma únicamente los segundos completos de un tramo en ejecución", () => {
    expect(calculateActiveSeconds(125, 10_000, 16_999)).toBe(131);
  });

  it("mantiene el acumulado al estar pausado y permite sumar segmentos reanudados", () => {
    const afterFirstSegment = calculateActiveSeconds(0, 1_000, 61_000);
    const whilePaused = calculateActiveSeconds(afterFirstSegment, null, 90_000);
    const afterResume = calculateActiveSeconds(whilePaused, 120_000, 150_000);

    expect(afterFirstSegment).toBe(60);
    expect(whilePaused).toBe(60);
    expect(afterResume).toBe(90);
  });

  it("clampa entradas negativas y timestamps invertidos a cero transcurrido", () => {
    expect(calculateActiveSeconds(-8, 20_000, 10_000)).toBe(0);
  });
});

describe("canResumePomodoro", () => {
  const dayMs = 24 * 60 * 60 * 1000;

  it("reanuda una fase activa futura dentro de la ventana de recuperación", () => {
    expect(canResumePomodoro(200_000, 100_000, dayMs)).toBe(true);
  });

  it("descarta una fase vencida, en su instante límite o con antigüedad de 24 horas", () => {
    expect(canResumePomodoro(100_000, 100_000, dayMs)).toBe(false);
    expect(canResumePomodoro(99_999, 100_000, dayMs)).toBe(false);
    expect(canResumePomodoro(100_000 + dayMs, 100_000, dayMs)).toBe(false);
  });
});

describe("persistencia recuperable del temporizador", () => {
  const runningState = {
    mode: "WORK" as const,
    endAt: 200_000,
    remainingSeconds: 90,
    plannedSeconds: 120,
    taskId: "task-1",
    cycleTaskId: "task-1",
      accumulatedActiveSeconds: 25,
      segmentStartedAt: 105_000,
      sessionStartedAt: 80_000,
      savedAt: 105_000,
  };

  it("serializa y restaura fase, tarea y segmentos activos", () => {
    const restored = parsePomodoroState(serializePomodoroState(runningState));

    expect(restored).toEqual(runningState);
    expect(recoverPomodoroState(restored, 115_000)).toEqual({
      ...runningState,
      activeSeconds: 35,
    });
  });

  it("conserva tarea y acumulado en pausa sin contar el tiempo pausado", () => {
    const pausedState = {
      ...runningState,
      endAt: 0,
      remainingSeconds: 90,
      accumulatedActiveSeconds: 25,
      segmentStartedAt: null,
      savedAt: 115_000,
    };

    expect(recoverPomodoroState(pausedState, 130_000)).toEqual({
      ...pausedState,
      activeSeconds: 25,
    });
  });

  it("preserva el inicio real de WORK al cruzar medianoche con pausa, reanudación y recarga", () => {
    const timeZone = "America/Los_Angeles";
    const startedAt = new Date("2026-10-14T06:58:00.000Z"); // 23:58 local
    const pausedAt = new Date("2026-10-14T06:59:00.000Z"); // 23:59 local
    const resumedAt = new Date("2026-10-14T07:09:00.000Z"); // 00:09 local
    const endedAt = new Date("2026-10-14T07:33:00.000Z"); // 00:33 local
    const initiallyRunning = {
      ...runningState,
      endAt: startedAt.getTime() + 25 * 60 * 1000,
      plannedSeconds: 25 * 60,
      segmentStartedAt: startedAt.getTime(),
      sessionStartedAt: startedAt.getTime(),
      savedAt: startedAt.getTime(),
    };
    const pausedState = {
      ...initiallyRunning,
      endAt: 0,
      remainingSeconds: 24 * 60,
      accumulatedActiveSeconds: 60,
      segmentStartedAt: null,
      savedAt: pausedAt.getTime(),
    };
    const loadedPausedState = parsePomodoroState(serializePomodoroState(pausedState));
    const resumedState = {
      ...loadedPausedState!,
      endAt: endedAt.getTime(),
      segmentStartedAt: resumedAt.getTime(),
      savedAt: resumedAt.getTime(),
    };
    const loadedRunningState = parsePomodoroState(serializePomodoroState(resumedState));
    const startedDay = toDateKey(new Date(loadedRunningState!.sessionStartedAt!), timeZone);
    const endedDay = toDateKey(endedAt, timeZone);
    const workCountForStartDay = getCompletedWorkSessionsTodayAfterCompletion({
      phase: "WORK",
      completedWorkSessionsToday: 0,
      countedDay: startedDay,
      today: startedDay,
      workStartedDay: startedDay,
    });

    expect(loadedRunningState?.sessionStartedAt).toBe(startedAt.getTime());
    expect(startedDay).toBe("2026-10-13");
    expect(endedDay).toBe("2026-10-14");
    expect(endedAt.getTime() - loadedRunningState!.sessionStartedAt!).not.toBe(
      initiallyRunning.plannedSeconds * 1000,
    );
    expect(workCountForStartDay).toBe(1);
    expect(getNextPomodoroPhase("WORK", {
      autoAdvance: true,
      completedWorkSessionsToday: workCountForStartDay,
      longBreakInterval: 1,
    })).toBe("LONG_BREAK");
  });

  it("conserva la tarea del ciclo durante un descanso sin asignársela a la fase", () => {
    const breakState = {
      ...runningState,
      mode: "LONG_BREAK" as const,
      taskId: null,
      cycleTaskId: "task-1",
    };

    expect(parsePomodoroState(serializePomodoroState(breakState))).toEqual(breakState);
  });

  it("descarta estados vencidos y conserva compatibilidad con datos previos", () => {
    const expired = { ...runningState, endAt: 90_000, savedAt: 105_000 };
    const expiredPause = {
      ...runningState,
      endAt: 0,
      segmentStartedAt: null,
      savedAt: 105_000,
    };
    const legacy = JSON.stringify({
      mode: "WORK",
      endAt: 200_000,
      remainingSeconds: 90,
      plannedSeconds: 120,
    });

    expect(recoverPomodoroState(expired, 100_000)).toBeNull();
    expect(
      recoverPomodoroState(expiredPause, 105_000 + 24 * 60 * 60 * 1000),
    ).toBeNull();
    expect(parsePomodoroState("not json")).toBeNull();
    expect(parsePomodoroState(legacy)).toMatchObject({
      mode: "WORK",
      taskId: null,
      accumulatedActiveSeconds: 30,
      segmentStartedAt: null,
      sessionStartedAt: null,
    });
  });

  it("migra un estado legacy pausado y suma solo el segmento tras reanudar", () => {
    const legacy = parsePomodoroState(JSON.stringify({
      mode: "WORK",
      endAt: 0,
      remainingSeconds: 300,
      plannedSeconds: 1500,
    }));

    expect(legacy?.accumulatedActiveSeconds).toBe(1200);
    expect(legacy?.sessionStartedAt).toBeNull();

    const persistedAfterResume = parsePomodoroState(serializePomodoroState({
      ...legacy!,
      endAt: 310_000,
      segmentStartedAt: 10_000,
      savedAt: 10_000,
    }));
    const recovered = recoverPomodoroState(persistedAfterResume, 20_000);

    expect(recovered?.activeSeconds).toBe(1210);
    expect(
      calculateActiveSeconds(
        recovered!.accumulatedActiveSeconds,
        recovered!.segmentStartedAt,
        310_000,
      ),
    ).toBe(1500);
    expect(recovered?.sessionStartedAt).toBeNull();
  });

  it("migra un estado legacy en curso y empieza a contar desde su recuperación", () => {
    const legacy = parsePomodoroState(JSON.stringify({
      mode: "WORK",
      endAt: 310_000,
      remainingSeconds: 300,
      plannedSeconds: 1500,
    }));
    const recovered = recoverPomodoroState(legacy, 10_000);

    expect(legacy?.accumulatedActiveSeconds).toBe(1200);
    expect(recovered?.activeSeconds).toBe(1200);
    expect(recovered?.segmentStartedAt).toBe(10_000);

    const persistedAfterRecovery = parsePomodoroState(serializePomodoroState({
      ...recovered!,
      endAt: 310_000,
      remainingSeconds: 300,
      savedAt: 10_000,
    }));
    const completedSeconds = calculateActiveSeconds(
      persistedAfterRecovery!.accumulatedActiveSeconds,
      persistedAfterRecovery!.segmentStartedAt,
      310_000,
    );

    expect(completedSeconds).toBe(1500);
    expect(persistedAfterRecovery?.sessionStartedAt).toBeNull();
  });

  it("no reemplaza el acumulador explícito de estados nuevos por el tiempo deducido", () => {
    const current = parsePomodoroState(JSON.stringify({
      mode: "WORK",
      endAt: 310_000,
      remainingSeconds: 300,
      plannedSeconds: 1500,
      accumulatedActiveSeconds: 420,
      segmentStartedAt: 20_000,
      sessionStartedAt: 10_000,
      savedAt: 20_000,
    }));

    expect(current?.accumulatedActiveSeconds).toBe(420);
    expect(recoverPomodoroState(current, 30_000)?.activeSeconds).toBe(430);
  });
});

describe("getPomodoroSessionSeconds", () => {
  it("usa el tiempo activo en sesiones nuevas y planificado como fallback explícito para legacy", () => {
    expect(getPomodoroSessionSeconds({
      phase: "WORK",
      actualSeconds: 600,
      plannedSeconds: 1500,
    })).toBe(600);
    expect(getPomodoroSessionSeconds({
      phase: "WORK",
      actualSeconds: 0,
      plannedSeconds: 1500,
    })).toBe(1500);
    expect(getPomodoroSessionSeconds({
      phase: "SHORT_BREAK",
      actualSeconds: 300,
      plannedSeconds: 300,
    })).toBe(0);
  });
});
