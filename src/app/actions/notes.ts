"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { noteSchema } from "@/lib/validations";

export type NoteResult = {
  ok: boolean;
  error?: string;
  id?: string;
};

function firstIssue(error: { issues?: Array<{ message?: string }> }): string {
  return error.issues?.[0]?.message ?? "Datos no válidos.";
}

export async function createNoteAction(formData: FormData): Promise<NoteResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "No autorizado." };
  }

  const parsed = noteSchema.safeParse({
    title: formData.get("title") ?? "Sin título",
    content: formData.get("content") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const note = await prisma.note.create({
    data: { userId: user.id, title: parsed.data.title, content: parsed.data.content },
    select: { id: true },
  });

  revalidatePath("/notes");

  return { ok: true, id: note.id };
}

export async function updateNoteAction(formData: FormData): Promise<NoteResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "No autorizado." };
  }

  const id = formData.get("id");
  if (typeof id !== "string") {
    return { ok: false, error: "Nota no válida." };
  }

  const parsed = noteSchema.safeParse({
    title: formData.get("title") ?? "Sin título",
    content: formData.get("content") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }

  const note = await prisma.note.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });

  if (!note) {
    return { ok: false, error: "Nota no encontrada." };
  }

  await prisma.note.update({
    where: { id },
    data: { title: parsed.data.title, content: parsed.data.content },
  });

  revalidatePath("/notes");

  return { ok: true, id };
}

export async function togglePinNoteAction(formData: FormData): Promise<NoteResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "No autorizado." };
  }

  const id = formData.get("id");
  if (typeof id !== "string") {
    return { ok: false, error: "Nota no válida." };
  }

  const note = await prisma.note.findFirst({
    where: { id, userId: user.id },
    select: { id: true, pinned: true },
  });

  if (!note) {
    return { ok: false, error: "Nota no encontrada." };
  }

  await prisma.note.update({ where: { id }, data: { pinned: !note.pinned } });

  revalidatePath("/notes");

  return { ok: true, id };
}

export async function deleteNoteAction(formData: FormData): Promise<NoteResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "No autorizado." };
  }

  const id = formData.get("id");
  if (typeof id !== "string") {
    return { ok: false, error: "Nota no válida." };
  }

  const note = await prisma.note.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });

  if (!note) {
    return { ok: false, error: "Nota no encontrada." };
  }

  await prisma.note.delete({ where: { id } });

  revalidatePath("/notes");

  return { ok: true, id };
}