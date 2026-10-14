import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  transaction: vi.fn(),
  taskUpdateMany: vi.fn(),
  taskFindFirst: vi.fn(),
  sessionCreate: vi.fn(),
  sessionFindUnique: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: h.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: h.transaction,
    task: { findFirst: h.taskFindFirst },
    pomodoroSession: { findFirst: h.sessionFindUnique },
  },
}));

import { completePomodoroAction } from "@/app/actions/pomodoro";

const user = { id: "user-1", name: "Ada", email: "ada@example.com", timezone: "UTC" };
const startedAt = "2026-10-13T12:00:00.000Z";
const endedAt = "2026-10-13T12:25:00.000Z";
const segments = [[Date.parse(startedAt), Date.parse(endedAt)]];

function sessionForm(options: {
  id?: string | null;
  phase?: string;
  plannedSeconds?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  activeSegments?: string | null;
  completed?: string | null;
  taskId?: string | null;
  actualSeconds?: string;
} = {}) {
  const formData = new FormData();
  if (!("id" in options)) formData.set("id", "phase-stable-id");
  else if (typeof options.id === "string") formData.set("id", options.id);
  formData.set("phase", options.phase ?? "WORK");
  formData.set("plannedSeconds", options.plannedSeconds ?? "1500");
  if (!("startedAt" in options)) formData.set("startedAt", startedAt);
  else if (typeof options.startedAt === "string") formData.set("startedAt", options.startedAt);
  if (!("endedAt" in options)) formData.set("endedAt", endedAt);
  else if (typeof options.endedAt === "string") formData.set("endedAt", options.endedAt);
  if (!("activeSegments" in options)) formData.set("activeSegments", JSON.stringify(segments));
  else if (typeof options.activeSegments === "string") formData.set("activeSegments", options.activeSegments);
  formData.set("completed", options.completed ?? "true");
  if (!("taskId" in options)) formData.set("taskId", "task-1");
  else if (typeof options.taskId === "string") formData.set("taskId", options.taskId);
  if (options.actualSeconds !== undefined) formData.set("actualSeconds", options.actualSeconds);
  return formData;
}

function transactionClient(options: {
  taskCount?: number;
  existing?: Record<string, unknown> | null;
} = {}) {
  h.taskUpdateMany.mockResolvedValue({ count: options.taskCount ?? 1 });
  h.taskFindFirst.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === "task-1" ? { id: "task-1" } : null,
  );
  h.sessionFindUnique.mockResolvedValue(options.existing ?? null);
  h.sessionCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: data.id }));
  h.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      task: { updateMany: h.taskUpdateMany, findFirst: h.taskFindFirst },
      pomodoroSession: { create: h.sessionCreate, findFirst: h.sessionFindUnique },
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
    ["ID ausente", { id: null }],
    ["fase inválida", { phase: "NAP" }],
    ["duración prevista cero", { plannedSeconds: "0" }],
    ["duración prevista sobre el límite", { plannedSeconds: "28801" }],
    ["timestamps ausentes", { endedAt: null }],
    ["timestamps inválidos", { startedAt: "ayer" }],
    ["intervalo invertido", { endedAt: "2026-10-13T11:59:00.000Z" }],
    ["segmentos ausentes", { activeSegments: null }],
    ["segmento JSON inválido", { activeSegments: "not-json" }],
    ["segmento fuera del intervalo", { activeSegments: JSON.stringify([[Date.parse(startedAt) - 1, Date.parse(endedAt)]]) }],
    ["segmento vacío", { activeSegments: JSON.stringify([[Date.parse(startedAt), Date.parse(startedAt)]]) }],
    ["segmentos solapados", { activeSegments: JSON.stringify([[1000, 5000], [4000, 6000]]) }],
    ["estado inválido", { completed: "pending" }],
    ["duración real cero al completar", { activeSegments: "[]" }],
  ] as const)("rechaza %s", async (_description, overrides) => {
    const result = await completePomodoroAction(sessionForm(overrides));
    expect(result.ok).toBe(false);
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it("deriva los segundos activos de segmentos y, en la misma transacción, imputa tiempo de pared", async () => {
    const formData = sessionForm({ taskId: "task-1", actualSeconds: "1" });
    formData.set("activeSegments", JSON.stringify([
      [Date.parse(startedAt), Date.parse(startedAt) + 500],
      [Date.parse(startedAt) + 500, Date.parse(startedAt) + 1500],
    ]));

    const result = await completePomodoroAction(formData);

    expect(result).toEqual({ ok: true, id: "phase-stable-id" });
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.taskUpdateMany).toHaveBeenCalledWith({
      where: { id: "task-1", userId: user.id },
      data: { accumulatedSeconds: { increment: 1500 } },
    });
    expect(createdSessionData()).toMatchObject({
      id: "phase-stable-id",
      userId: user.id,
      taskId: "task-1",
      phase: "WORK",
      plannedSeconds: 1500,
      actualSeconds: 1,
      startedAt: new Date(startedAt),
      endedAt: new Date(endedAt),
      completed: true,
    });
    expect(createdSessionData()).not.toHaveProperty("activeSegments");
    expect(h.revalidatePath.mock.calls).toEqual([["/pomodoro"], ["/dashboard"], ["/tasks"]]);
  });

  it("acepta segmentos activos que suman más que lo planeado, siempre dentro de la pared", async () => {
    const result = await completePomodoroAction(sessionForm({
      plannedSeconds: "60",
      activeSegments: JSON.stringify([[Date.parse(startedAt), Date.parse(endedAt)]]),
    }));
    expect(result.ok).toBe(true);
    expect(createdSessionData().actualSeconds).toBe(1500);
  });

  it("limita el incremento de tarea a ocho horas por fase", async () => {
    const result = await completePomodoroAction(sessionForm({
      endedAt: "2026-10-14T12:00:00.000Z",
      plannedSeconds: "28800",
      activeSegments: JSON.stringify([[Date.parse(startedAt), Date.parse("2026-10-14T12:00:00.000Z")]]),
    }));
    expect(result.ok).toBe(true);
    expect(h.taskUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { accumulatedSeconds: { increment: 28800 } },
    }));
    expect(createdSessionData().actualSeconds).toBe(86400);
  });

  it("registra descansos asociados y también imputa su tiempo de pared", async () => {
    const result = await completePomodoroAction(sessionForm({ phase: "SHORT_BREAK" }));
    expect(result.ok).toBe(true);
    expect(h.taskUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "task-1", userId: user.id },
      data: { accumulatedSeconds: { increment: 1500 } },
    }));
    expect(createdSessionData()).toMatchObject({ phase: "SHORT_BREAK", taskId: "task-1" });
  });

  it("persiste abandono con completed=false, fin efectivo y cero activo", async () => {
    const result = await completePomodoroAction(sessionForm({ completed: "false", activeSegments: "[]" }));
    expect(result.ok).toBe(true);
    expect(createdSessionData()).toMatchObject({ completed: false, actualSeconds: 0, endedAt: new Date(endedAt) });
    expect(h.taskUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { accumulatedSeconds: { increment: 1500 } },
    }));
  });

  it("registra fases sin tarea y descansos sin tarea sin imputar", async () => {
    const noTask = await completePomodoroAction(sessionForm({ taskId: null }));
    expect(noTask.ok).toBe(true);
    expect(createdSessionData()).toMatchObject({ taskId: null, actualSeconds: 1500 });
    expect(h.taskUpdateMany).not.toHaveBeenCalled();

    vi.clearAllMocks();
    h.getCurrentUser.mockResolvedValue(user);
    transactionClient();
    const breakWithoutTask = await completePomodoroAction(sessionForm({ phase: "LONG_BREAK", taskId: null }));
    expect(breakWithoutTask.ok).toBe(true);
    expect(createdSessionData()).toMatchObject({ taskId: null, phase: "LONG_BREAK" });
  });

  it.each(["tarea ajena", "tarea eliminada"])("guarda sin vincular una %s", async () => {
    transactionClient({ taskCount: 0 });
    const result = await completePomodoroAction(sessionForm());
    expect(result.ok).toBe(true);
    expect(createdSessionData()).toMatchObject({ taskId: null });
    expect(h.taskUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "task-1", userId: user.id } }));
  });

  it("no altera el estado de una tarea", async () => {
    await completePomodoroAction(sessionForm());
    expect(h.taskUpdateMany.mock.calls[0][0].data).toEqual({ accumulatedSeconds: { increment: 1500 } });
  });

  it("acepta retry idempotente por los seis valores persistidos, aunque cambien segmentos", async () => {
    h.sessionFindUnique.mockResolvedValue({
      id: "phase-stable-id", userId: user.id, taskId: "task-1", phase: "WORK",
      plannedSeconds: 1500, actualSeconds: 1500, startedAt: new Date(startedAt),
      endedAt: new Date(endedAt), completed: true,
    });
    const result = await completePomodoroAction(sessionForm({
      activeSegments: JSON.stringify([
        [Date.parse(startedAt), Date.parse(startedAt) + 1000],
        [Date.parse(startedAt) + 1000, Date.parse(endedAt)],
      ]),
    }));
    expect(result).toEqual({ ok: true, id: "phase-stable-id" });
    expect(h.taskUpdateMany).not.toHaveBeenCalled();
    expect(h.sessionCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["fase", { phase: "SHORT_BREAK" }],
    ["tarea", { taskId: null }],
    ["duración activa", { activeSegments: JSON.stringify([[Date.parse(startedAt), Date.parse(startedAt) + 1000]]) }],
    ["inicio", {
      startedAt: "2026-10-13T12:00:01.000Z",
      activeSegments: JSON.stringify([[Date.parse(startedAt) + 1000, Date.parse(endedAt)]]),
    }],
    ["fin", {
      endedAt: "2026-10-13T12:24:59.000Z",
      activeSegments: JSON.stringify([[Date.parse(startedAt), Date.parse(endedAt) - 1000]]),
    }],
    ["estado", { completed: "false", activeSegments: "[]" }],
  ] as const)("rechaza retry conflictivo si cambia %s sin modificar datos", async (_field, overrides) => {
    h.sessionFindUnique.mockResolvedValue({
      id: "phase-stable-id", userId: user.id, taskId: "task-1", phase: "WORK",
      actualSeconds: 1500, startedAt: new Date(startedAt), endedAt: new Date(endedAt), completed: true,
    });
    const result = await completePomodoroAction(sessionForm(overrides));
    expect(result).toEqual({ ok: false, error: "Conflicto al registrar la fase." });
    expect(h.taskUpdateMany).not.toHaveBeenCalled();
    expect(h.sessionCreate).not.toHaveBeenCalled();
  });

  it("si hay carrera de IDs, recupera el registro ganador y no duplica la imputación", async () => {
    const uniqueError = Object.assign(new Error("duplicate id"), { code: "P2002" });
    h.transaction.mockRejectedValue(uniqueError);
    h.sessionFindUnique.mockResolvedValue({
      id: "phase-stable-id", userId: user.id, taskId: "task-1", phase: "WORK",
      actualSeconds: 1500, startedAt: new Date(startedAt), endedAt: new Date(endedAt), completed: true,
    });
    const result = await completePomodoroAction(sessionForm());
    expect(result).toEqual({ ok: true, id: "phase-stable-id" });
    expect(h.taskUpdateMany).not.toHaveBeenCalled();
  });

  it("conflicto por carrera no reemplaza al ganador", async () => {
    const uniqueError = Object.assign(new Error("duplicate id"), { code: "P2002" });
    h.transaction.mockRejectedValue(uniqueError);
    h.sessionFindUnique.mockResolvedValue({
      id: "phase-stable-id", userId: user.id, taskId: null, phase: "WORK",
      actualSeconds: 1500, startedAt: new Date(startedAt), endedAt: new Date(endedAt), completed: false,
    });
    const result = await completePomodoroAction(sessionForm());
    expect(result).toEqual({ ok: false, error: "Conflicto al registrar la fase." });
  });

  it("mantiene imputación y registro dentro de la misma transacción ante fallo de persistencia", async () => {
    const dbError = new Error("persistencia fallida");
    h.sessionCreate.mockRejectedValue(dbError);
    await expect(completePomodoroAction(sessionForm())).rejects.toThrow("persistencia fallida");
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.taskUpdateMany).toHaveBeenCalledTimes(1);
    expect(h.sessionCreate).toHaveBeenCalledTimes(1);
  });

  it("no oculta fallos de base de datos sin un registro ganador", async () => {
    const dbError = new Error("persistencia fallida");
    h.transaction.mockRejectedValue(dbError);
    await expect(completePomodoroAction(sessionForm())).rejects.toThrow("persistencia fallida");
  });
});
