"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import {
  createNoteAction,
  deleteNoteAction,
  togglePinNoteAction,
  updateNoteAction,
} from "@/app/actions/notes";
import { Button, EmptyState } from "@/components/ui";
import type { Note } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

type NoteDraft = {
  title: string;
  content: string;
};

function shortDate(date: Date): string {
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function NotesClient({ initialNotes }: { initialNotes: Note[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialNotes[0]?.id ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [isCreating, startCreating] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");

  const selected = notes.find((note) => note.id === selectedId) ?? null;
  const selectedDraft: NoteDraft | null = selected
    ? { title: selected.title, content: selected.content }
    : null;

  function createNote() {
    setError(null);
    startCreating(async () => {
      const result = await createNoteAction(new FormData());
      if (!result.ok || !result.id) {
        setError(result.error ?? "No se pudo crear la nota.");
        return;
      }

      const note: Note = {
        id: result.id,
        userId: "",
        title: "Sin título",
        content: "",
        pinned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setNotes((prev) => [note, ...prev]);
      setSelectedId(result.id);
    });
  }

  function scheduleSave(id: string, draft: NoteDraft) {
    const signature = `${id}:${draft.title}:${draft.content}`;
    if (signature === lastSavedRef.current) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(async () => {
      const formData = new FormData();
      formData.set("id", id);
      formData.set("title", draft.title);
      formData.set("content", draft.content);

      setSaving(true);
      const result = await updateNoteAction(formData);
      setSaving(false);

      if (result.ok) {
        lastSavedRef.current = signature;
        setNotes((prev) =>
          prev.map((note) =>
            note.id === id ? { ...note, ...draft, updatedAt: new Date() } : note,
          ),
        );
      } else {
        setError(result.error ?? "No se pudo guardar.");
      }
    }, 800);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  function togglePin(note: Note) {
    setNotes((prev) =>
      prev
        .map((item) => (item.id === note.id ? { ...item, pinned: !item.pinned } : item))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned)),
    );

    const formData = new FormData();
    formData.set("id", note.id);
    void togglePinNoteAction(formData);
  }

  function remove(note: Note) {
    setNotes((prev) => prev.filter((item) => item.id !== note.id));
    if (selectedId === note.id) {
      setSelectedId(null);
    }

    const formData = new FormData();
    formData.set("id", note.id);
    void deleteNoteAction(formData);
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4 lg:flex-row">
      <aside className="w-full shrink-0 space-y-2 lg:w-72">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Notas</h1>
          <Button onClick={createNote} disabled={isCreating}>
            {isCreating ? "…" : "＋ Nueva"}
          </Button>
        </div>

        {notes.length === 0 ? (
          <EmptyState
            title="Sin notas"
            description="Crea la primera con “Nueva”."
          />
        ) : (
          <ul className="space-y-1.5">
            {notes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(note.id)}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2 text-left transition-colors",
                    note.id === selectedId
                      ? "border-primary bg-accent"
                      : "border-border bg-card hover:border-muted-foreground/40",
                  )}
                >
                  <span className="flex items-center gap-2">
                    {note.pinned ? (
                      <span aria-hidden className="text-xs text-amber-500">
                        ★
                      </span>
                    ) : null}
                    <span className="truncate text-sm font-medium">
                      {note.title || "Sin título"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {shortDate(note.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="min-w-0 flex-1 rounded-2xl border border-border bg-card shadow-sm">
        {selected && selectedDraft ? (
          <NoteEditor
            key={selected.id}
            note={selected}
            draft={selectedDraft}
            saving={saving}
            onChangeTitle={(title) =>
              setNotes((prev) =>
                prev.map((item) =>
                  item.id === selected.id ? { ...item, title } : item,
                ),
              )
            }
            onChangeContent={(content) =>
              setNotes((prev) =>
                prev.map((item) =>
                  item.id === selected.id ? { ...item, content } : item,
                ),
              )
            }
            onScheduleSave={(draft) => scheduleSave(selected.id, draft)}
            onTogglePin={() => togglePin(selected)}
            onDelete={() => remove(selected)}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <EmptyState
              title={notes.length ? "Selecciona una nota" : "Sin notas"}
              description="Las notas se guardan automáticamente mientras escribes."
            />
          </div>
        )}
      </section>

      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive lg:col-span-2"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function NoteEditor({
  note,
  draft,
  saving,
  onChangeTitle,
  onChangeContent,
  onScheduleSave,
  onTogglePin,
  onDelete,
}: {
  note: Note;
  draft: NoteDraft;
  saving: boolean;
  onChangeTitle: (title: string) => void;
  onChangeContent: (content: string) => void;
  onScheduleSave: (draft: NoteDraft) => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onTogglePin}
          aria-label={note.pinned ? "Desfijar nota" : "Fijar nota"}
          className={cn(
            "rounded-lg px-2 py-1 text-sm transition-colors hover:bg-muted",
            note.pinned ? "text-amber-500" : "text-muted-foreground",
          )}
        >
          ★
        </button>
        <span
          className={cn(
            "ml-auto text-xs",
            saving ? "text-muted-foreground" : "text-transparent",
          )}
        >
          Guardando…
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          Borrar
        </button>
      </div>

      <input
        value={draft.title}
        onChange={(event) => {
          onChangeTitle(event.target.value);
          onScheduleSave({ title: event.target.value, content: draft.content });
        }}
        placeholder="Sin título"
        className="w-full bg-transparent px-5 pt-4 text-xl font-semibold outline-none placeholder:text-muted-foreground/60"
      />

      <textarea
        value={draft.content}
        onChange={(event) => {
          onChangeContent(event.target.value);
          onScheduleSave({ title: draft.title, content: event.target.value });
        }}
        placeholder="Escribe aquí…"
        className="min-h-0 w-full flex-1 resize-none bg-transparent px-5 py-4 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  );
}