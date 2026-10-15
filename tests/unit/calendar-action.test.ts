import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  eventCreate: vi.fn(),
  eventFindFirst: vi.fn(),
  eventUpdate: vi.fn(),
  eventDelete: vi.fn(),
  categoryFindFirst: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: h.revalidatePath }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: h.getCurrentUser }));
vi.mock("@/lib/db", () => ({
  prisma: {
    calendarEvent: {
      create: h.eventCreate,
      findFirst: h.eventFindFirst,
      update: h.eventUpdate,
      delete: h.eventDelete,
    },
    category: { findFirst: h.categoryFindFirst },
  },
}));

import {
  createCalendarEventAction,
  deleteCalendarEventAction,
  updateCalendarEventAction,
} from "@/app/actions/calendar";
import { calendarEventSchema } from "@/lib/validations";

const user = { id: "user-1", name: "Ada", email: "ada@example.com", timezone: "UTC" };

function eventForm(overrides: Record<string, string | null> = {}): FormData {
  const values: Record<string, string | null> = {
    title: "Reunión",
    description: "",
    dateKey: "2026-10-15",
    allDay: "true",
    startMinutes: "",
    endMinutes: "",
    categoryId: "",
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null) formData.set(key, value);
  }
  return formData;
}

function eventData(call: ReturnType<typeof vi.fn>["mock"]["calls"][number]) {
  return call[0].data as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getCurrentUser.mockResolvedValue(user);
  h.eventCreate.mockResolvedValue({ id: "event-1" });
  h.eventFindFirst.mockResolvedValue({ id: "event-1" });
  h.eventUpdate.mockResolvedValue({ id: "event-1" });
  h.eventDelete.mockResolvedValue({ id: "event-1" });
  h.categoryFindFirst.mockResolvedValue({ id: "category-1" });
});

describe("calendarEventSchema", () => {
  it("normaliza título, descripción/categoría vacías y minutos de FormData", () => {
    const parsed = calendarEventSchema.parse({
      title: "  Reunión  ",
      description: "  ",
      dateKey: "2026-10-15",
      allDay: "false",
      startMinutes: "540",
      endMinutes: "600",
      categoryId: "",
    });

    expect(parsed).toMatchObject({
      title: "Reunión",
      description: null,
      dateKey: "2026-10-15",
      allDay: false,
      startMinutes: 540,
      endMinutes: 600,
      categoryId: null,
    });
  });

  it("rechaza fecha imposible, título en blanco o demasiado largo", () => {
    const base = {
      title: "Evento",
      dateKey: "2026-10-15",
      allDay: true,
      startMinutes: null,
      endMinutes: null,
    };
    expect(calendarEventSchema.safeParse({ ...base, dateKey: "2026-02-29" }).success).toBe(false);
    expect(calendarEventSchema.safeParse({ ...base, title: "   " }).success).toBe(false);
    expect(calendarEventSchema.safeParse({ ...base, title: "x".repeat(201) }).success).toBe(false);
  });

  it.each([
    ["horas en evento todo el día", { allDay: true, startMinutes: 1, endMinutes: 2 }],
    ["minutos en blanco convertidos a cero", { allDay: false, startMinutes: "", endMinutes: "" }],
    ["falta el inicio", { allDay: false, startMinutes: null, endMinutes: 10 }],
    ["falta el fin", { allDay: false, startMinutes: 10, endMinutes: null }],
    ["inicio negativo", { allDay: false, startMinutes: -1, endMinutes: 10 }],
    ["inicio posterior al máximo", { allDay: false, startMinutes: 1440, endMinutes: 1440 }],
    ["fin cero", { allDay: false, startMinutes: 0, endMinutes: 0 }],
    ["fin posterior al día", { allDay: false, startMinutes: 1439, endMinutes: 1441 }],
    ["fin no posterior", { allDay: false, startMinutes: 60, endMinutes: 60 }],
    ["minutos no numéricos", { allDay: false, startMinutes: "nueve", endMinutes: "600" }],
  ] as const)("rechaza %s", (_case, overrides) => {
    const base = {
      title: "Evento",
      dateKey: "2026-10-15",
      allDay: true,
      startMinutes: null,
      endMinutes: null,
    };
    expect(calendarEventSchema.safeParse({ ...base, ...overrides }).success).toBe(false);
  });

  it("acepta fin exclusivo 1440 y eventos de día completo sin minutos", () => {
    expect(calendarEventSchema.parse({
      title: "Día completo",
      dateKey: "2026-10-15",
      allDay: "true",
      startMinutes: "",
      endMinutes: "",
    })).toMatchObject({ allDay: true, startMinutes: null, endMinutes: null });
    expect(calendarEventSchema.parse({
      title: "Hasta medianoche",
      dateKey: "2026-10-15",
      allDay: "false",
      startMinutes: "1439",
      endMinutes: "1440",
    })).toMatchObject({ allDay: false, startMinutes: 1439, endMinutes: 1440 });
  });
});

describe("calendar event Server Actions", () => {
  it.each([
    ["create", () => createCalendarEventAction(eventForm())],
    ["update", () => updateCalendarEventAction(eventForm({ id: "event-1" }))],
    ["delete", () => deleteCalendarEventAction(new FormData())],
  ])("requiere usuario autenticado para %s", async (_action, run) => {
    h.getCurrentUser.mockResolvedValue(null);
    const result = await run();
    expect(result).toEqual({ ok: false, error: "No autorizado." });
    expect(h.eventCreate).not.toHaveBeenCalled();
    expect(h.eventUpdate).not.toHaveBeenCalled();
    expect(h.eventDelete).not.toHaveBeenCalled();
    expect(h.eventFindFirst).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("crea evento de día completo y convierte los campos vacíos en null", async () => {
    const result = await createCalendarEventAction(eventForm());
    expect(result).toEqual({ ok: true, id: "event-1" });
    expect(h.eventCreate).toHaveBeenCalledWith({
      data: {
        userId: user.id,
        title: "Reunión",
        description: null,
        dateKey: "2026-10-15",
        allDay: true,
        startMinutes: null,
        endMinutes: null,
        categoryId: null,
      },
      select: { id: true },
    });
    expect(h.revalidatePath.mock.calls).toEqual([["/calendar"], ["/dashboard"]]);
  });

  it("crea evento horario con categoría propia y minutos enteros", async () => {
    const result = await createCalendarEventAction(eventForm({
      allDay: "false",
      startMinutes: "540",
      endMinutes: "600",
      categoryId: "category-1",
    }));
    expect(result.ok).toBe(true);
    expect(eventData(h.eventCreate.mock.calls[0])).toMatchObject({
      userId: user.id,
      allDay: false,
      startMinutes: 540,
      endMinutes: 600,
      categoryId: "category-1",
    });
    expect(h.categoryFindFirst).toHaveBeenCalledWith({
      where: { id: "category-1", userId: user.id },
      select: { id: true },
    });
  });

  it.each([
    ["fecha inválida", { dateKey: "2026-04-31" }],
    ["título blanco", { title: "   " }],
    ["todo el día con minutos", { startMinutes: "0" }],
    ["horario incompleto", { allDay: "false", startMinutes: "600", endMinutes: "" }],
    ["horario fuera de rango", { allDay: "false", startMinutes: "1440", endMinutes: "1441" }],
    ["fin no posterior", { allDay: "false", startMinutes: "600", endMinutes: "600" }],
  ] as const)("rechaza %s sin escrituras", async (_case, overrides) => {
    const result = await createCalendarEventAction(eventForm(overrides));
    expect(result.ok).toBe(false);
    expect(h.eventCreate).not.toHaveBeenCalled();
    expect(h.eventUpdate).not.toHaveBeenCalled();
    expect(h.eventDelete).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["categoría ajena", "categoría inexistente"])("rechaza %s sin crear", async () => {
    h.categoryFindFirst.mockResolvedValue(null);
    const result = await createCalendarEventAction(eventForm({ categoryId: "foreign-category" }));
    expect(result).toEqual({ ok: false, error: "Categoría no válida." });
    expect(h.eventCreate).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("edita un evento propio tras comprobar ownership", async () => {
    const result = await updateCalendarEventAction(eventForm({
      id: "event-1",
      title: "Actualizado",
      categoryId: "category-1",
    }));
    expect(result).toEqual({ ok: true, id: "event-1" });
    expect(h.eventFindFirst).toHaveBeenCalledWith({
      where: { id: "event-1", userId: user.id },
      select: { id: true },
    });
    expect(h.eventUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "event-1", userId: user.id },
      data: expect.objectContaining({ title: "Actualizado", categoryId: "category-1" }),
      select: { id: true },
    }));
    expect(h.revalidatePath.mock.calls).toEqual([["/calendar"], ["/dashboard"]]);
  });

  it.each(["inexistente", "ajeno"])("rechaza actualización de evento %s", async () => {
    h.eventFindFirst.mockResolvedValue(null);
    const result = await updateCalendarEventAction(eventForm({ id: "event-foreign" }));
    expect(result).toEqual({ ok: false, error: "Evento no encontrado." });
    expect(h.eventUpdate).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("no actualiza si la categoría no pertenece al usuario", async () => {
    h.categoryFindFirst.mockResolvedValue(null);
    const result = await updateCalendarEventAction(eventForm({ id: "event-1", categoryId: "foreign" }));
    expect(result.ok).toBe(false);
    expect(h.eventUpdate).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });

  it("borra un evento propio después de comprobar ownership", async () => {
    const formData = new FormData();
    formData.set("id", "event-1");
    const result = await deleteCalendarEventAction(formData);
    expect(result).toEqual({ ok: true, id: "event-1" });
    expect(h.eventFindFirst).toHaveBeenCalledWith({
      where: { id: "event-1", userId: user.id },
      select: { id: true },
    });
    expect(h.eventDelete).toHaveBeenCalledWith({
      where: { id: "event-1", userId: user.id },
      select: { id: true },
    });
    expect(h.revalidatePath.mock.calls).toEqual([["/calendar"], ["/dashboard"]]);
  });

  it.each(["inexistente", "ajeno"])("rechaza borrado de evento %s", async () => {
    h.eventFindFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("id", "event-foreign");
    const result = await deleteCalendarEventAction(formData);
    expect(result).toEqual({ ok: false, error: "Evento no encontrado." });
    expect(h.eventDelete).not.toHaveBeenCalled();
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});
