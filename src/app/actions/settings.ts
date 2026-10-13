"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  appearanceSchema,
  pomodoroSettingsSchema,
} from "@/lib/validations";

export type SettingsResult = {
  ok: boolean;
  error?: string;
  message?: string;
};

function firstIssue(error: { issues?: Array<{ message?: string }> }): string {
  return error.issues?.[0]?.message ?? "Datos no válidos.";
}

export async function updateAppearanceAction(
  _prevState: SettingsResult,
  formData: FormData,
): Promise<SettingsResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "No autorizado." };
  }

  const parsed = appearanceSchema.safeParse({
    theme: formData.get("theme") ?? "SYSTEM",
    timezone: formData.get("timezone"),
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { timezone: parsed.data.timezone },
  });

  await prisma.userPreferences.upsert({
    where: { userId: user.id },
    update: { theme: parsed.data.theme },
    create: { userId: user.id, theme: parsed.data.theme },
  });

  revalidatePath("/settings");
  revalidatePath("/(app)", "layout");

  return { ok: true, message: "Preferencias guardadas." };
}

export async function updatePomodoroSettingsAction(
  _prevState: SettingsResult,
  formData: FormData,
): Promise<SettingsResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "No autorizado." };
  }

  const parsed = pomodoroSettingsSchema.safeParse({
    workMinutes: formData.get("workMinutes"),
    shortBreakMinutes: formData.get("shortBreakMinutes"),
    longBreakMinutes: formData.get("longBreakMinutes"),
    longBreakInterval: formData.get("longBreakInterval"),
    dailyPomodoroGoal: formData.get("dailyPomodoroGoal"),
    notificationsEnabled: formData.get("notificationsEnabled") === "on",
    autoAdvance: formData.get("autoAdvance") === "on",
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const data = {
    workMinutes: parsed.data.workMinutes,
    shortBreakMinutes: parsed.data.shortBreakMinutes,
    longBreakMinutes: parsed.data.longBreakMinutes,
    longBreakInterval: parsed.data.longBreakInterval,
    dailyPomodoroGoal: parsed.data.dailyPomodoroGoal,
    notificationsEnabled: parsed.data.notificationsEnabled,
    autoAdvance: parsed.data.autoAdvance,
  };

  await prisma.userPreferences.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
  });

  revalidatePath("/settings");
  revalidatePath("/pomodoro");
  revalidatePath("/dashboard");

  return { ok: true, message: "Preferencias guardadas." };
}

export async function updateThemeAction(theme: string): Promise<SettingsResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "No autorizado." };
  }

  if (theme !== "LIGHT" && theme !== "DARK" && theme !== "SYSTEM") {
    return { ok: false, error: "Tema no válido." };
  }

  await prisma.userPreferences.upsert({
    where: { userId: user.id },
    update: { theme },
    create: { userId: user.id, theme },
  });

  revalidatePath("/(app)", "layout");

  return { ok: true };
}
