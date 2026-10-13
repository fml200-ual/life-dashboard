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

function parseActualSeconds(value: unknown, plannedSeconds: number): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const seconds = Number(value);
  if (
    !Number.isInteger(seconds) ||
    seconds <= 0 ||
    seconds > plannedSeconds ||
    seconds > 8 * 3600
  ) {
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
  const rawActualSeconds = formData.get("actualSeconds");
  const rawStartedAt = formData.get("startedAt");
  const rawEndedAt = formData.get("endedAt");

  if (
    !phase ||
    !plannedSeconds ||
    typeof rawStartedAt !== "string" ||
    typeof rawEndedAt !== "string"
  ) {
    return { ok: false, error: "Datos de sesión no válidos." };
  }

  const actualSeconds = parseActualSeconds(rawActualSeconds, plannedSeconds);
  if (actualSeconds === null) {
    return { ok: false, error: "Duración real no válida." };
  }

  const startedAt = new Date(rawStartedAt);
  const endedAt = new Date(rawEndedAt);
  if (
    Number.isNaN(startedAt.getTime()) ||
    Number.isNaN(endedAt.getTime()) ||
    startedAt.getTime() > endedAt.getTime()
  ) {
    return { ok: false, error: "Momento de sesión no válido." };
  }

  const rawTaskId = formData.get("taskId");
  if (rawTaskId !== null && typeof rawTaskId !== "string") {
    return { ok: false, error: "Tarea no válida." };
  }
  const taskId = typeof rawTaskId === "string" && rawTaskId ? rawTaskId : null;

  if (phase !== "WORK" && taskId) {
    return { ok: false, error: "Una pausa no puede tener una tarea asignada." };
  }

  const session = await prisma.$transaction(async (tx) => {
    let associatedTaskId: string | null = null;

    if (phase === "WORK" && taskId) {
      const update = await tx.task.updateMany({
        where: { id: taskId, userId: user.id },
        data: { accumulatedSeconds: { increment: actualSeconds } },
      });

      // An absent, deleted, or foreign task is deliberately treated alike: the
      // completed focus is retained, but it cannot be linked to another user.
      if (update.count === 1) {
        associatedTaskId = taskId;
      }
    }

    return tx.pomodoroSession.create({
      data: {
        userId: user.id,
        taskId: associatedTaskId,
        phase,
        plannedSeconds,
        actualSeconds,
        startedAt,
        endedAt,
        completed: true,
      },
      select: { id: true },
    });
  });

  revalidatePath("/pomodoro");
  revalidatePath("/dashboard");

  return { ok: true, id: session.id };
}
