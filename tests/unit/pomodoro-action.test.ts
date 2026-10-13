import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  transaction: vi.fn(),
  taskUpdateMany: vi.fn(),
  sessionCreate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: h.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: h.transaction,
  },
}));

import { completePomodoroAction } from "@/app/actions/pomodoro";

const user = { id: "user-1", name: "Ada", email: "ada@example.com", timezone: "UTC" };

function sessionForm(options: {
  phase?: string;
  plannedSeconds?: string;
  actualSeconds?: string | null;
  taskId?: string;
  startedAt?: string | null;
} = {}) {
  const formData = new FormData();
  formData.set("phase", options.phase ?? "WORK");
  formData.set("plannedSeconds", options.plannedSeconds ?? "1500");
  if ("actualSeconds" in options) {
    if (typeof options.actualSeconds === "string") {
      formData.set("actualSeconds", options.actualSeconds);
    }
  } else {
    formData.set("actualSeconds", "1487");
  }
  if (options.startedAt !== null) {
    formData.set("startedAt", options.startedAt ?? "2026-10-13T12:00:00.000Z");
  }
  formData.set("endedAt", "2026-10-13T12:25:00.000Z");
  if (options.taskId !== undefined) formData.set("taskId", options.taskId);
  return formData;
}

function transactionClient(taskCount = 1) {
  h.taskUpdateMany.mockResolvedValue({ count: taskCount });
  h.sessionCreate.mockResolvedValue({ id: "session-1" });
  h.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      task: { updateMany: h.taskUpdateMany },
      pomodoroSession: { create: h.sessionCreate },
    }),
  );
}

function createdSessionData() {
  return h.sessionCreate.mock.calls[0][0].data as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getCurrentUser.mockResolvedValue(user);
  transactionClient();
});

describe("completePomodoroAction", () => {
  it("requiere usuario autenticado", async () => {
    h.getCurrentUser.mockResolvedValue(null);

    const result = await completePomodoroAction(sessionForm());

    expect(result).toEqual({ ok: false, error: "No autorizado." });
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["fase inválida", { phase: "NAP" }],
    ["duración prevista cero", { plannedSeconds: "0" }],
    ["segundos reales ausentes", { actualSeconds: null }],
    ["segundos reales no numéricos", { actualSeconds: "muchos" }],
    ["segundos reales fraccionarios", { actualSeconds: "12.5" }],
    ["segundos reales negativos", { actualSeconds: "-1" }],
    ["segundos reales por encima de lo previsto", { plannedSeconds: "1500", actualSeconds: "1501" }],
    ["duración superior al límite", { plannedSeconds: "28801", actualSeconds: "28800" }],
    ["inicio de sesión ausente", { startedAt: null }],
  ] as const)("rechaza %s", async (_description, overrides) => {
    const result = await completePomodoroAction(sessionForm(overrides));

    expect(result.ok).toBe(false);
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it("rechaza cualquier tarea para una fase de descanso", async () => {
    const result = await completePomodoroAction(
      sessionForm({ phase: "SHORT_BREAK", taskId: "task-1" }),
    );

    expect(result).toEqual({ ok: false, error: "Una pausa no puede tener una tarea asignada." });
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it("registra WORK y suma segundos reales a una tarea propia dentro de la misma transacción", async () => {
    const result = await completePomodoroAction(sessionForm({ taskId: "task-1" }));

    expect(result).toEqual({ ok: true, id: "session-1" });
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.taskUpdateMany).toHaveBeenCalledWith({
      where: { id: "task-1", userId: user.id },
      data: { accumulatedSeconds: { increment: 1487 } },
    });
    expect(createdSessionData()).toMatchObject({
      userId: user.id,
      taskId: "task-1",
      phase: "WORK",
      plannedSeconds: 1500,
      actualSeconds: 1487,
      endedAt: new Date("2026-10-13T12:25:00.000Z"),
      completed: true,
    });
    expect(createdSessionData().startedAt).toEqual(new Date("2026-10-13T12:00:00.000Z"));
    expect(h.revalidatePath.mock.calls).toEqual([["/pomodoro"], ["/dashboard"]]);
  });

  it("persiste el inicio real anterior a medianoche y no lo reconstruye desde la duración prevista", async () => {
    const formData = sessionForm({
      plannedSeconds: "1500",
      actualSeconds: "1500",
      startedAt: "2026-10-13T06:58:00.000Z",
    });
    formData.set("endedAt", "2026-10-14T07:33:00.000Z");

    const result = await completePomodoroAction(formData);

    expect(result.ok).toBe(true);
    expect(createdSessionData().startedAt).toEqual(new Date("2026-10-13T06:58:00.000Z"));
  });

  it("registra un descanso con actualSeconds pero nunca actualiza tareas", async () => {
    const result = await completePomodoroAction(
      sessionForm({ phase: "LONG_BREAK", plannedSeconds: "900", actualSeconds: "892" }),
    );

    expect(result.ok).toBe(true);
    expect(h.taskUpdateMany).not.toHaveBeenCalled();
    expect(createdSessionData()).toMatchObject({
      taskId: null,
      phase: "LONG_BREAK",
      actualSeconds: 892,
      plannedSeconds: 900,
    });
  });

  it("registra WORK sin tarea sin imputar tiempo", async () => {
    const result = await completePomodoroAction(sessionForm());

    expect(result.ok).toBe(true);
    expect(h.taskUpdateMany).not.toHaveBeenCalled();
    expect(createdSessionData()).toMatchObject({ taskId: null, actualSeconds: 1487 });
  });

  it.each(["tarea ajena", "tarea eliminada"])("no asocia ni imputa una %s", async () => {
    transactionClient(0);

    const result = await completePomodoroAction(sessionForm({ taskId: "task-unavailable" }));

    expect(result.ok).toBe(true);
    expect(h.taskUpdateMany).toHaveBeenCalledWith({
      where: { id: "task-unavailable", userId: user.id },
      data: { accumulatedSeconds: { increment: 1487 } },
    });
    expect(createdSessionData()).toMatchObject({ taskId: null, actualSeconds: 1487 });
  });

  it("no cambia el estado de una tarea al completar el foco", async () => {
    await completePomodoroAction(sessionForm({ taskId: "task-1" }));

    expect(h.taskUpdateMany.mock.calls[0][0].data).toEqual({
      accumulatedSeconds: { increment: 1487 },
    });
    expect(h.taskUpdateMany.mock.calls[0][0].data).not.toHaveProperty("status");
  });

  it("no deja una imputación parcial si no se puede crear el registro de sesión", async () => {
    h.sessionCreate.mockRejectedValue(new Error("persistencia fallida"));

    await expect(
      completePomodoroAction(sessionForm({ taskId: "task-1" })),
    ).rejects.toThrow("persistencia fallida");
    expect(h.transaction).toHaveBeenCalledTimes(1);
  });
});
