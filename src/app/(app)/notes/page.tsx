import { NotesClient } from "./notes-client";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function NotesPage() {
  const user = await requireUser();

  const notes = await prisma.note.findMany({
    where: { userId: user.id },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });

  return <NotesClient initialNotes={notes} />;
}