"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  calculateActualSeconds,
  calculateTaskWallSeconds,
  isValidActiveSegments,
  type ActiveTimeSegment,
  type PomodoroPhase,
} from "@/lib/pomodoro";

export type PomodoroResult = {
  ok: boolean;
  error?: string;
  id?: string;
};

const MAX_PLANNED_SECONDS = 28_800;
const SESSION_CONFLICT = "Conflicto al registrar la fase.";

function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds > 0 && seconds <= MAX_PLANNED_SECONDS
    ? seconds
    : null;
}

function parsePhase(value: unknown): PomodoroPhase | null {
  return value === "WORK" || value === "SHORT_BREAK" || value === "LONG_BREAK"
    ? value
    : null;
}

function parseSegments(value: unknown): ActiveTimeSegment[] | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;

    const segments: ActiveTimeSegment[] = [];
    for (const segment of parsed) {
      if (
        !Array.isArray(segment) ||
        segment.length !== 2 ||
        typeof segment[0] !== "number" ||
        typeof segment[1] !== "number"
      ) {
        return null;
      }
      segments.push([segment[0], segment[1]]);
    }
    return segments;
  } catch {
    return null;
  }
}

function parseTaskId(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const taskId = value.trim();
  if (taskId.length === 0) return null;
  return taskId.length <= 191 ? taskId : undefined;
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

type PersistedSession = {
  id: string;
  userId: string;
  taskId: string | null;
  phase: PomodoroPhase;
  actualSeconds: number;
  startedAt: Date;
  endedAt: Date | null;
  completed: boolean;
};

function sameFinalValues(
  existing: PersistedSession,
  expected: Omit<PersistedSession, "id" | "userId">,
): boolean {
  return existing.phase === expected.phase &&
    existing.taskId === expected.taskId &&
    existing.actualSeconds === expected.actualSeconds &&
    existing.startedAt.getTime() === expected.startedAt.getTime() &&
    existing.endedAt?.getTime() === expected.endedAt?.getTime() &&
    existing.completed === expected.completed;
}

async function resolveOwnedTaskId(taskId: string | null, userId: string): Promise<string | null> {
  if (!taskId) return null;
  const task = await prisma.task.findFirst({
    where: { id: taskId, userId },
    select: { id: true },
  });
  return task?.id ?? null;
}

export async function completePomodoroAction(formData: FormData): Promise<PomodoroResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "No autorizado." };

  const rawId = formData.get("id");
  const id = typeof rawId === "string" ? rawId.trim() : "";
  const phase = parsePhase(formData.get("phase"));
  const plannedSeconds = parsePositiveInt(formData.get("plannedSeconds"));
  const rawStartedAt = formData.get("startedAt");
  const rawEndedAt = formData.get("endedAt");
  const segments = parseSegments(formData.get("activeSegments"));
  const rawCompleted = formData.get("completed");
  const completed = rawCompleted === "true" ? true : rawCompleted === "false" ? false : null;
  const taskId = parseTaskId(formData.get("taskId"));

  if (
    !id || id.length > 191 || !phase || !plannedSeconds ||
    typeof rawStartedAt !== "string" || typeof rawEndedAt !== "string" ||
    !segments || completed === null || taskId === undefined
  ) {
    return { ok: false, error: "Datos de sesión no válidos." };
  }

  const startedAt = new Date(rawStartedAt);
  const endedAt = new Date(rawEndedAt);
  if (
    !Number.isFinite(startedAt.getTime()) ||
    !Number.isFinite(endedAt.getTime()) ||
    endedAt.getTime() < startedAt.getTime() ||
    !isValidActiveSegments(startedAt.getTime(), endedAt.getTime(), segments)
  ) {
    return { ok: false, error: "Momento de sesión no válido." };
  }

  const actualSeconds = calculateActualSeconds(segments);
  if ((completed && actualSeconds < 1) || actualSeconds > (endedAt.getTime() - startedAt.getTime()) / 1000) {
    return { ok: false, error: "Duración real no válida." };
  }

  const wallSeconds = calculateTaskWallSeconds(startedAt.getTime(), endedAt.getTime());
  const expectedSession = {
    taskId: null as string | null,
    phase,
    actualSeconds,
    startedAt,
    endedAt,
    completed,
  };

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const existing = await tx.pomodoroSession.findFirst({
        where: { id, userId: user.id },
        select: {
          id: true,
          userId: true,
          taskId: true,
          phase: true,
          actualSeconds: true,
          startedAt: true,
          endedAt: true,
          completed: true,
        },
      });

      if (existing) {
        const existingTask = taskId
          ? await tx.task.findFirst({
              where: { id: taskId, userId: user.id },
              select: { id: true },
            })
          : null;
        expectedSession.taskId = existingTask?.id ?? null;
        return sameFinalValues(existing, expectedSession)
          ? { kind: "existing" as const }
          : { kind: "conflict" as const };
      }

      let associatedTaskId: string | null = null;
      if (taskId) {
        const update = await tx.task.updateMany({
          where: { id: taskId, userId: user.id },
          data: { accumulatedSeconds: { increment: wallSeconds } },
        });
        if (update.count === 1) associatedTaskId = taskId;
      }

      expectedSession.taskId = associatedTaskId;
      const session = await tx.pomodoroSession.create({
        data: {
          id,
          userId: user.id,
          taskId: associatedTaskId,
          phase,
          plannedSeconds,
          actualSeconds,
          startedAt,
          endedAt,
          completed,
        },
        select: { id: true },
      });
      return { kind: "created" as const, id: session.id };
    });

    if (outcome.kind === "conflict") return { ok: false, error: SESSION_CONFLICT };
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    // A concurrent transaction may have committed this ID while this one was
    // attempting its create. Its failed transaction rolls back the task update.
    const winner = await prisma.pomodoroSession.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        userId: true,
        taskId: true,
        phase: true,
        actualSeconds: true,
        startedAt: true,
        endedAt: true,
        completed: true,
      },
    });
    if (!winner) return { ok: false, error: SESSION_CONFLICT };
    expectedSession.taskId = await resolveOwnedTaskId(taskId, user.id);
    if (!sameFinalValues(winner, expectedSession)) {
      return { ok: false, error: SESSION_CONFLICT };
    }
  }

  revalidatePath("/pomodoro");
  revalidatePath("/dashboard");
  revalidatePath("/tasks");
  return { ok: true, id };
}
