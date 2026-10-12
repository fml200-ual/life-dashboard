"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { todayKey, utcMidnightFromDateKey } from "@/lib/date";
import { prisma } from "@/lib/db";
import { categorySchema, taskSchema } from "@/lib/validations";

export type ActionResult = {
  ok: boolean;
  error?: string;
  id?: string;
};

function firstError(error: { issues?: Array<{ message: string }> } | unknown): string {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues?: Array<{ message?: string }> }).issues;
    if (issues?.[0]?.message) {
      return issues[0].message;
    }
  }

  return "Datos no válidos.";
}

export async function createTaskAction(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "No autorizado." };
  }

  const parsed = taskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    status: formData.get("status") ?? undefined,
    priority: formData.get("priority") ?? undefined,
    dueDate: formData.get("dueDate") ?? undefined,
    categoryId: formData.get("categoryId") ?? undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error) };
  }

  const data = parsed.data;

  if (data.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, userId: user.id },
      select: { id: true },
    });

    if (!category) {
      return { ok: false, error: "Categoría no válida." };
    }
  }

  const task = await prisma.task.create({
    data: {
      userId: user.id,
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      dueDate: data.dueDate ? utcMidnightFromDateKey(data.dueDate) : null,
      categoryId: data.categoryId,
    },
    select: { id: true },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");

  return { ok: true, id: task.id };
}

export async function updateTaskAction(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "No autorizado." };
  }

  const id = formData.get("id");
  if (typeof id !== "string") {
    return { ok: false, error: "Tarea no válida." };
  }

  const parsed = taskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    status: formData.get("status") ?? undefined,
    priority: formData.get("priority") ?? undefined,
    dueDate: formData.get("dueDate") ?? undefined,
    categoryId: formData.get("categoryId") ?? undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error) };
  }

  const data = parsed.data;

  if (data.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, userId: user.id },
      select: { id: true },
    });

    if (!category) {
      return { ok: false, error: "Categoría no válida." };
    }
  }

  const task = await prisma.task.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });

  if (!task) {
    return { ok: false, error: "Tarea no encontrada." };
  }

  await prisma.task.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      dueDate: data.dueDate ? utcMidnightFromDateKey(data.dueDate) : null,
      categoryId: data.categoryId,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");

  return { ok: true, id };
}

export async function toggleTaskAction(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "No autorizado." };
  }

  const id = formData.get("id");
  if (typeof id !== "string") {
    return { ok: false, error: "Tarea no válida." };
  }

  const task = await prisma.task.findFirst({
    where: { id, userId: user.id },
    select: { id: true, status: true, categoryId: true, completedAt: true },
  });

  if (!task) {
    return { ok: false, error: "Tarea no encontrada." };
  }

  const completing = task.status !== "DONE";

  await prisma.task.update({
    where: { id },
    data: {
      status: completing ? "DONE" : "TODO",
      completedAt: completing ? new Date() : null,
    },
  });

  if (completing && task.categoryId) {
    const dateKey = todayKey(user.timezone);

    await prisma.streakDay.upsert({
      where: {
        userId_categoryId_date: {
          userId: user.id,
          categoryId: task.categoryId,
          date: dateKey,
        },
      },
      update: { count: { increment: 1 } },
      create: {
        userId: user.id,
        categoryId: task.categoryId,
        date: dateKey,
      },
    });
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");

  return { ok: true, id };
}

export async function deleteTaskAction(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "No autorizado." };
  }

  const id = formData.get("id");
  if (typeof id !== "string") {
    return { ok: false, error: "Tarea no válida." };
  }

  const task = await prisma.task.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });

  if (!task) {
    return { ok: false, error: "Tarea no encontrada." };
  }

  await prisma.task.delete({ where: { id } });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");

  return { ok: true, id };
}

export async function createCategoryAction(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "No autorizado." };
  }

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color") ?? undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error) };
  }

  const category = await prisma.category.upsert({
    where: { userId_name: { userId: user.id, name: parsed.data.name } },
    update: { color: parsed.data.color },
    create: { userId: user.id, name: parsed.data.name, color: parsed.data.color },
    select: { id: true },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");

  return { ok: true, id: category.id };
}