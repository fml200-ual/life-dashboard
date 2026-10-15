"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import {
  createCalendarEventAction,
  deleteCalendarEventAction,
  updateCalendarEventAction,
} from "@/app/actions/calendar";
import { Badge, Button, EmptyState, Input, Select, Textarea } from "@/components/ui";
import {
  getMonthGrid,
  navigateCalendarSelection,
  selectCalendarDate,
  todayCalendarSelection,
  type CalendarSelection,
} from "@/lib/calendar";
import {
  buildCalendarHref,
  filterCalendarEntries,
  formatLocalTime,
  getDayAgenda,
  getDayPreview,
  parseLocalTime,
  type CalendarCategoryView,
  type CalendarEventView,
  type CalendarTaskView,
} from "@/lib/calendar-view";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const SHORT_WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

type EditorState = { dateKey: string; event: CalendarEventView | null } | null;
type CategoryFilter = "ALL" | "NONE" | string;

type CalendarClientProps = {
  initialMonth: string;
  initialSelectedDate: string;
  today: string;
  events: CalendarEventView[];
  tasks: CalendarTaskView[];
  categories: CalendarCategoryView[];
};

export function CalendarClient(props: CalendarClientProps) {
  return (
    <CalendarClientContent
      key={`${props.initialMonth}:${props.initialSelectedDate}`}
      {...props}
    />
  );
}

function CalendarClientContent({
  initialMonth,
  initialSelectedDate,
  today,
  events,
  tasks,
  categories,
}: CalendarClientProps) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [editor, setEditor] = useState<EditorState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selection: CalendarSelection = {
    monthKey: initialMonth,
    selectedDate: initialSelectedDate,
  };
  const filtered = filterCalendarEntries(events, tasks, categoryFilter);
  const grid = getMonthGrid(initialMonth);
  const agenda = getDayAgenda(initialSelectedDate, filtered.events, filtered.tasks);
  const selectedDateLabel = formatDateLabel(initialSelectedDate);

  function deleteEvent(event: CalendarEventView) {
    setActionError(null);
    const formData = new FormData();
    formData.set("id", event.id);
    startTransition(async () => {
      const result = await deleteCalendarEventAction(formData);
      if (!result.ok) {
        setActionError(result.error ?? "No se pudo borrar el evento.");
        return;
      }
      window.location.reload();
    });
  }

  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-6 pb-8" data-calendar-month={initialMonth} data-calendar-day={initialSelectedDate}>
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Calendario</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tus eventos y fechas de entrega, en un mismo lugar.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="calendar-category-filter">Filtrar por categoría</label>
          <Select
            id="calendar-category-filter"
            aria-label="Filtrar eventos y tareas por categoría"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="min-w-44 flex-1 sm:flex-none"
          >
            <option value="ALL">Todas las categorías</option>
            <option value="NONE">Sin categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </Select>
          <Button variant="secondary" onClick={() => setEditor({ dateKey: initialSelectedDate, event: null })}>
            Crear evento
          </Button>
        </div>
      </header>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.85fr)]">
        <section aria-label="Vista mensual" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-semibold capitalize tracking-tight" aria-live="polite">
                {monthLabel(initialMonth)}
              </h2>
              <span className="hidden text-sm text-muted-foreground sm:inline">Vista mensual</span>
            </div>
            <div className="flex items-center gap-1">
              <MonthLink selection={navigateCalendarSelection(selection, -1)} direction="previous" />
              <button
                type="button"
                onClick={() => window.location.assign(buildCalendarHref(todayCalendarSelection(today)))}
                aria-label="Ir a hoy"
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Hoy
              </button>
              <MonthLink selection={navigateCalendarSelection(selection, 1)} direction="next" />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="grid grid-cols-7 border-b border-border bg-muted/50">
              {WEEKDAYS.map((weekday, index) => (
                <div key={weekday} className="px-1 py-2 text-center text-xs font-medium text-muted-foreground sm:px-3 sm:py-3">
                  <span className="sm:hidden" aria-hidden="true">{SHORT_WEEKDAYS[index]}</span>
                  <span className="hidden sm:inline" aria-hidden="true">{weekday}</span>
                  <span className="sr-only">{["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"][index]}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {grid.map((day, index) => {
                const preview = getDayPreview(day.dateKey, filtered.events, filtered.tasks, 3);
                const isSelected = day.dateKey === initialSelectedDate;
                const isToday = day.dateKey === today;
                return (
                  <div
                    key={day.dateKey}
                    className={cn(
                      "min-h-[5.5rem] min-w-0 border-b border-r border-border p-1.5 last:border-r-0 sm:min-h-28 sm:p-2",
                      index >= grid.length - 7 && "border-b-0",
                      !day.inCurrentMonth && "bg-muted/25",
                      isSelected && "bg-accent/60",
                    )}
                  >
                    <Link
                      href={buildCalendarHref(selectCalendarDate(day.dateKey))}
                      aria-label={`${formatDateLabel(day.dateKey)}${isSelected ? ", seleccionado" : ""}${day.dateKey === today ? ", hoy" : ""}`}
                      aria-current={isToday ? "date" : undefined}
                      className={cn(
                        "mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:mb-2 sm:h-8 sm:w-8 sm:text-sm",
                        !day.inCurrentMonth && "text-muted-foreground/65",
                        isToday && "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
                        isSelected && !isToday && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                      )}
                    >
                      {Number(day.dateKey.slice(-2))}
                    </Link>
                    <div className="space-y-1">
                      {preview.items.map((item) => "allDay" in item ? (
                        <span
                          key={`event-${item.id}`}
                          title={item.title}
                          className="flex min-w-0 items-center gap-1 truncate rounded-sm border-l-2 bg-muted/70 px-1 py-0.5 text-[10px] leading-3 text-foreground sm:text-xs"
                          style={item.category ? { borderLeftColor: item.category.color } : undefined}
                        >
                          <span className="truncate">{item.title}</span>
                        </span>
                      ) : (
                        <span
                          key={`task-${item.id}`}
                          title={`Tarea: ${item.title}`}
                          className={cn(
                            "block min-w-0 truncate rounded-sm px-1 py-0.5 text-[10px] leading-3 sm:text-xs",
                            item.status === "DONE"
                              ? "text-muted-foreground line-through"
                              : item.dateKey < today
                                ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                                : "bg-background text-muted-foreground",
                          )}
                        >
                          <span className="mr-1" aria-hidden="true">□</span>{item.title}
                        </span>
                      ))}
                      {preview.hiddenCount > 0 ? (
                        <Link
                          href={buildCalendarHref(selectCalendarDate(day.dateKey))}
                          className="block truncate px-1 text-[10px] font-medium text-muted-foreground hover:text-foreground sm:text-xs"
                          aria-label={`Ver ${preview.hiddenCount} elementos más del ${formatDateLabel(day.dateKey)}`}
                        >
                          +{preview.hiddenCount} más
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside aria-labelledby="agenda-title" className="min-w-0">
          <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">AGENDA DEL DÍA</p>
              <h2 id="agenda-title" className="mt-1 text-xl font-semibold tracking-tight">
                {selectedDateLabel}
              </h2>
            </div>
            <Button
              variant="secondary"
              className="shrink-0"
              onClick={() => {
                setActionError(null);
                setEditor({ dateKey: initialSelectedDate, event: null });
              }}
            >
              + Evento
            </Button>
          </div>

          {actionError ? <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{actionError}</p> : null}

          {editor ? (
            <CalendarEventForm
              key={editor.event?.id ?? `new-${editor.dateKey}`}
              event={editor.event}
              dateKey={editor.dateKey}
              categories={categories}
              onCancel={() => setEditor(null)}
              onError={setActionError}
            />
          ) : null}

          {agenda.events.length === 0 && agenda.tasks.length === 0 && !editor ? (
            <EmptyState
              className="mt-4"
              title="Día sin elementos"
              description="Puedes añadir un evento para organizar esta fecha."
            />
          ) : null}

          {agenda.events.length > 0 ? (
            <section className="mt-5" aria-labelledby="events-title">
              <h3 id="events-title" className="mb-2 text-xs font-semibold text-muted-foreground">EVENTOS</h3>
              <ul className="space-y-2">
                {agenda.events.map((event) => (
                  <li key={event.id} className="rounded-lg border border-border border-l-4 bg-card p-3" style={event.category ? { borderLeftColor: event.category.color } : undefined}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium">{event.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {event.allDay ? "Todo el día" : `${formatLocalTime(event.startMinutes ?? 0)}–${formatLocalTime(event.endMinutes ?? 0)}`}
                        </p>
                        {event.description ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{event.description}</p> : null}
                        {event.category ? <CategoryTag category={event.category} /> : null}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => { setActionError(null); setEditor({ dateKey: event.dateKey, event }); }}
                          disabled={isPending}
                          aria-label={`Editar ${event.title}`}
                          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                        >Editar</button>
                        <button
                          type="button"
                          onClick={() => deleteEvent(event)}
                          disabled={isPending}
                          aria-label={`Borrar ${event.title}`}
                          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        >Borrar</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {agenda.tasks.length > 0 ? (
            <section className="mt-5" aria-labelledby="tasks-title">
              <h3 id="tasks-title" className="mb-2 text-xs font-semibold text-muted-foreground">TAREAS CON VENCIMIENTO</h3>
              <ul className="space-y-2">
                {agenda.tasks.map((task) => {
                  const done = task.status === "DONE";
                  const overdue = !done && task.dateKey < today;
                  return (
                    <li key={task.id} className={cn("rounded-lg border border-border bg-card p-3", done && "opacity-60")}>
                      <div className="flex items-start gap-2">
                        <span aria-hidden="true" className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]", done ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/50 text-transparent")}>{done ? "✓" : "·"}</span>
                        <div className="min-w-0 flex-1">
                          <p className={cn("break-words text-sm font-medium", done && "text-muted-foreground line-through")}>{task.title}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge className={done ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-muted text-muted-foreground"}>{done ? "Completada" : task.status === "IN_PROGRESS" ? "En curso" : "Pendiente"}</Badge>
                            {overdue ? <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">Vencida</Badge> : null}
                            {task.category ? <CategoryTag category={task.category} /> : null}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}

function MonthLink({ selection, direction }: { selection: CalendarSelection; direction: "previous" | "next" }) {
  return (
    <Link
      href={buildCalendarHref(selection)}
      aria-label={direction === "previous" ? "Mes anterior" : "Mes siguiente"}
      className="flex h-10 w-10 items-center justify-center rounded-lg text-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {direction === "previous" ? "‹" : "›"}
    </Link>
  );
}

function CalendarEventForm({
  event,
  dateKey,
  categories,
  onCancel,
  onError,
}: {
  event: CalendarEventView | null;
  dateKey: string;
  categories: CalendarCategoryView[];
  onCancel: () => void;
  onError: (error: string | null) => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [eventDate, setEventDate] = useState(event?.dateKey ?? dateKey);
  const [allDay, setAllDay] = useState(event?.allDay ?? true);
  const [start, setStart] = useState(formatLocalTime(event?.startMinutes ?? 9 * 60));
  const [end, setEnd] = useState(formatLocalTime(event?.endMinutes ?? 10 * 60));
  const [categoryId, setCategoryId] = useState(event?.categoryId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setError(null);
    onError(null);

    const startMinutes = allDay ? null : parseLocalTime(start, "start");
    const endMinutes = allDay ? null : parseLocalTime(end, "end");
    if (!allDay && (startMinutes === null || endMinutes === null)) {
      setError("Indica las horas como HH:MM; el fin también puede ser 24:00.");
      return;
    }
    if (!allDay && startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
      setError("La hora de fin debe ser posterior a la de inicio.");
      return;
    }

    const formData = new FormData();
    formData.set("title", title);
    formData.set("description", description);
    formData.set("dateKey", eventDate);
    formData.set("allDay", String(allDay));
    formData.set("startMinutes", startMinutes === null ? "" : String(startMinutes));
    formData.set("endMinutes", endMinutes === null ? "" : String(endMinutes));
    formData.set("categoryId", categoryId);
    if (event) formData.set("id", event.id);

    startTransition(async () => {
      const action = event ? updateCalendarEventAction : createCalendarEventAction;
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error ?? "No se pudo guardar el evento.");
        return;
      }
      window.location.reload();
    });
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-primary/30 bg-accent/30 p-4" aria-label={event ? "Editar evento" : "Crear evento"}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{event ? "Editar evento" : "Nuevo evento"}</h3>
        <button type="button" onClick={onCancel} className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted" aria-label="Cerrar formulario">Cerrar</button>
      </div>
      <div className="space-y-1">
        <label htmlFor="event-title" className="text-xs font-medium">Título</label>
        <Input id="event-title" value={title} onChange={(input) => setTitle(input.target.value)} required maxLength={200} disabled={isPending} autoFocus />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="event-date" className="text-xs font-medium">Fecha</label>
          <Input id="event-date" type="date" value={eventDate} onChange={(input) => setEventDate(input.target.value)} required disabled={isPending} />
        </div>
        <div className="space-y-1">
          <label htmlFor="event-category" className="text-xs font-medium">Categoría</label>
          <Select id="event-category" value={categoryId} onChange={(input) => setCategoryId(input.target.value)} disabled={isPending}>
            <option value="">Sin categoría</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </Select>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={allDay} onChange={(input) => setAllDay(input.target.checked)} disabled={isPending} className="h-4 w-4 accent-primary" />
        Todo el día
      </label>
      {!allDay ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="event-start" className="text-xs font-medium">Empieza</label>
            <Input id="event-start" type="text" inputMode="numeric" placeholder="09:00" pattern="(?:[01]\d|2[0-3]):[0-5]\d" value={start} onChange={(input) => setStart(input.target.value)} disabled={isPending} />
          </div>
          <div className="space-y-1">
            <label htmlFor="event-end" className="text-xs font-medium">Termina</label>
            <Input id="event-end" type="text" inputMode="numeric" placeholder="10:00 o 24:00" pattern="(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)" value={end} onChange={(input) => setEnd(input.target.value)} disabled={isPending} />
          </div>
        </div>
      ) : null}
      <div className="space-y-1">
        <label htmlFor="event-description" className="text-xs font-medium">Descripción <span className="font-normal text-muted-foreground">(opcional)</span></label>
        <Textarea id="event-description" value={description} onChange={(input) => setDescription(input.target.value)} rows={2} maxLength={5000} disabled={isPending} />
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>{isPending ? "Guardando…" : event ? "Guardar cambios" : "Crear evento"}</Button>
      </div>
    </form>
  );
}

function CategoryTag({ category }: { category: CalendarCategoryView }) {
  return (
    <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} aria-hidden="true" />
      {category.name}
    </span>
  );
}

function monthLabel(monthKey: string): string {
  const month = Number(monthKey.slice(5, 7));
  const year = monthKey.slice(0, 4);
  return `${MONTHS[month - 1]} ${year}`;
}

function formatDateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  const weekday = new Intl.DateTimeFormat("es", { weekday: "long", timeZone: "UTC" }).format(date);
  return `${weekday}, ${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year}`;
}
