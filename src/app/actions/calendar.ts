"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calendarEventSchema } from "@/lib/validations";

export type ActionResult = {
  ok: boolean;
  error?: string;
  id?: string;
};

function firstError(error: { issues?: Array<{ message: string }> } | unknown): string {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as { issues?: Array<{ message?: string }> }).issues;
    if (issues?.[0]?.message) return issues[0].message;
  }

  return "Datos no válidos.";
}

function formValue(formData: FormData, key: string): FormDataEntryValue | undefined {
  return formData.get(key) ?? undefined;
}

function eventInput(formData: FormData) {
  return calendarEventSchema.safeParse({
    title: formValue(formData, "title"),
    description: formValue(formData, "description"),
    dateKey: formValue(formData, "dateKey"),
    allDay: formValue(formData, "allDay"),
    startMinutes: formValue(formData, "startMinutes"),
    endMinutes: formValue(formData, "endMinutes"),
    categoryId: formValue(formData, "categoryId"),
  });
}

function eventId(formData: FormData): string | null {
  const value = formData.get("id");
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function categoryBelongsToUser(categoryId: string | null, userId: string): Promise<boolean> {
  if (!categoryId) return true;

  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true },
  });

  return category !== null;
}

function revalidateCalendar(): void {
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
}

export async function createCalendarEventAction(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "No autorizado." };

  const parsed = eventInput(formData);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const data = parsed.data;
  if (!(await categoryBelongsToUser(data.categoryId, user.id))) {
    return { ok: false, error: "Categoría no válida." };
  }

  const event = await prisma.calendarEvent.create({
    data: { userId: user.id, ...data },
    select: { id: true },
  });

  revalidateCalendar();
  return { ok: true, id: event.id };
}

export async function updateCalendarEventAction(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "No autorizado." };

  const id = eventId(formData);
  if (!id) return { ok: false, error: "Evento no válido." };

  const parsed = eventInput(formData);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const existing = await prisma.calendarEvent.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Evento no encontrado." };

  const data = parsed.data;
  if (!(await categoryBelongsToUser(data.categoryId, user.id))) {
    return { ok: false, error: "Categoría no válida." };
  }

  const event = await prisma.calendarEvent.update({
    where: { id, userId: user.id },
    data,
    select: { id: true },
  });

  revalidateCalendar();
  return { ok: true, id: event.id };
}

export async function deleteCalendarEventAction(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "No autorizado." };

  const id = eventId(formData);
  if (!id) return { ok: false, error: "Evento no válido." };

  const existing = await prisma.calendarEvent.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "Evento no encontrado." };

  const event = await prisma.calendarEvent.delete({
    where: { id, userId: user.id },
    select: { id: true },
  });

  revalidateCalendar();
  return { ok: true, id: event.id };
}
