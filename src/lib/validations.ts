import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Introduce un correo válido"),
  password: z.string().min(1, "Introduce la contraseña"),
});

export const taskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE"]);
export const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

export const taskSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(200),
  description: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .transform((value) => (value ? value : null)),
  status: taskStatusSchema.default("TODO"),
  priority: taskPrioritySchema.default("MEDIUM"),
  dueDate: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  categoryId: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
});

export const noteSchema = z.object({
  title: z.string().trim().min(1, "El título es obligatorio").max(200),
  content: z.string().max(50000).default(""),
});

export const preferencesSchema = z.object({
  theme: z.enum(["LIGHT", "DARK", "SYSTEM"]),
  timezone: z.string().trim().min(1).max(64),
  workMinutes: z.coerce.number().int().min(1).max(180),
  shortBreakMinutes: z.coerce.number().int().min(1).max(60),
  longBreakMinutes: z.coerce.number().int().min(1).max(120),
  longBreakInterval: z.coerce.number().int().min(1).max(12),
  dailyPomodoroGoal: z.coerce.number().int().min(1).max(50),
  notificationsEnabled: z.coerce.boolean(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(60),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color no válido")
    .default("#6366f1"),
});

export const appearanceSchema = z.object({
  theme: z.enum(["LIGHT", "DARK", "SYSTEM"]),
  timezone: z.string().trim().min(1).max(64),
});

export const pomodoroSettingsSchema = z.object({
  workMinutes: z.coerce.number().int().min(1).max(180),
  shortBreakMinutes: z.coerce.number().int().min(1).max(60),
  longBreakMinutes: z.coerce.number().int().min(1).max(120),
  longBreakInterval: z.coerce.number().int().min(1).max(12),
  dailyPomodoroGoal: z.coerce.number().int().min(1).max(50),
  notificationsEnabled: z.coerce.boolean(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type NoteInput = z.infer<typeof noteSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
