"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type PomodoroResult = {
  ok: boolean;
  error?: string;
  id?: string;
};

function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > 8 * 3600) {
    return null;
  }

  return seconds;
}

function parsePhase(value: unknown): "WORK" | "SHORT_BREAK" | "LONG_BREAK" | null {
  if (value === "WORK" || value === "SHORT_BREAK" || value === "LONG_BREAK") {
    return value;
  }

  return null;
}

export async function completePomodoroAction(
  formData: FormData,
): Promise<PomodoroResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "No autorizado." };
  }

  const phase = parsePhase(formData.get("phase"));
  const plannedSeconds = parsePositiveInt(formData.get("plannedSeconds"));
  const rawEndedAt = formData.get("endedAt");

  if (!phase || !plannedSeconds || typeof rawEndedAt !== "string") {
    return { ok: false, error: "Datos de sesión no válidos." };
  }

  const endedAt = new Date(rawEndedAt);
  if (Number.isNaN(endedAt.getTime())) {
    return { ok: false, error: "Momento de finalización no válido." };
  }

  const taskId = formData.get("taskId");
  const taskIdStr = typeof taskId === "string" && taskId ? taskId : null;

  if (taskIdStr) {
    const task = await prisma.task.findFirst({
      where: { id: taskIdStr, userId: user.id },
      select: { id: true },
    });

    if (!task) {
      return { ok: false, error: "Tarea no válida." };
    }
  }

  const startedAt = new Date(endedAt.getTime() - plannedSeconds * 1000);

  const session = await prisma.pomodoroSession.create({
    data: {
      userId: user.id,
      taskId: taskIdStr,
      phase,
      plannedSeconds,
      startedAt,
      endedAt,
      completed: true,
    },
    select: { id: true },
  });

  revalidatePath("/pomodoro");
  revalidatePath("/dashboard");

  return { ok: true, id: session.id };
}