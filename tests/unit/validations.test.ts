import { describe, expect, it } from "vitest";

import {
  categorySchema,
  loginSchema,
  noteSchema,
  preferencesSchema,
  pomodoroSettingsSchema,
  taskSchema,
} from "@/lib/validations";

describe("loginSchema", () => {
  it("normaliza el email (trim + minúsculas) y acepta credenciales válidas", () => {
    const result = loginSchema.safeParse({
      email: "  User@Example.COM ",
      password: "secreta",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
    }
  });

  it("rechaza un email inválido", () => {
    expect(loginSchema.safeParse({ email: "no-es-email", password: "x" }).success).toBe(
      false,
    );
  });

  it("rechaza una contraseña vacía", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});

describe("taskSchema", () => {
  it("aplica valores por defecto (estado, prioridad y nulos)", () => {
    const result = taskSchema.parse({ title: "Tarea" });

    expect(result.status).toBe("TODO");
    expect(result.priority).toBe("MEDIUM");
    expect(result.categoryId).toBeNull();
    expect(result.dueDate).toBeNull();
  });

  it("exige un título no vacío", () => {
    expect(taskSchema.safeParse({ title: "   " }).success).toBe(false);
  });

  it("limita el título a 200 caracteres", () => {
    expect(taskSchema.safeParse({ title: "a".repeat(201) }).success).toBe(false);
  });

  it("convierte un vencimiento vacío en null", () => {
    expect(taskSchema.parse({ title: "x", dueDate: "" }).dueDate).toBeNull();
  });
});

describe("noteSchema", () => {
  it("exige título y deja el contenido vacío por defecto", () => {
    const result = noteSchema.parse({ title: "  Mi nota " });

    expect(result.title).toBe("Mi nota");
    expect(result.content).toBe("");
  });

  it("rechaza título vacío", () => {
    expect(noteSchema.safeParse({ title: "" }).success).toBe(false);
  });
});

describe("preferencesSchema", () => {
  const base = {
    theme: "DARK" as const,
    timezone: "Europe/Madrid",
    workMinutes: "25",
    shortBreakMinutes: "5",
    longBreakMinutes: "15",
    longBreakInterval: "4",
    dailyPomodoroGoal: "8",
    notificationsEnabled: true,
  };

  it("coacciona números de texto a enteros", () => {
    const result = preferencesSchema.parse(base);

    expect(result.workMinutes).toBe(25);
    expect(result.shortBreakMinutes).toBe(5);
    expect(result.notificationsEnabled).toBe(true);
  });

  it("rechaza valores fuera de rango", () => {
    expect(preferencesSchema.safeParse({ ...base, workMinutes: "0" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...base, workMinutes: "181" }).success).toBe(
      false,
    );
  });
});

describe("pomodoroSettingsSchema", () => {
  const base = {
    workMinutes: "25",
    shortBreakMinutes: "5",
    longBreakMinutes: "15",
    longBreakInterval: "4",
    dailyPomodoroGoal: "8",
    notificationsEnabled: true,
  };

  it("acepta el auto-avance marcado y desmarcado", () => {
    expect(pomodoroSettingsSchema.parse({ ...base, autoAdvance: true }).autoAdvance).toBe(
      true,
    );
    expect(pomodoroSettingsSchema.parse({ ...base, autoAdvance: false }).autoAdvance).toBe(
      false,
    );
  });

  it("mantiene apagado el auto-avance cuando no se proporciona", () => {
    expect(pomodoroSettingsSchema.parse(base).autoAdvance).toBe(false);
  });
});

describe("categorySchema", () => {
  it("aplica el color por defecto", () => {
    expect(categorySchema.parse({ name: "Salud" }).color).toBe("#6366f1");
  });

  it("rechaza un color no hexadecimal", () => {
    expect(categorySchema.safeParse({ name: "Salud", color: "red" }).success).toBe(false);
  });
});
