"use client";

import { useMemo, useState, useTransition } from "react";

import {
  createCategoryAction,
  createTaskAction,
  deleteTaskAction,
  toggleTaskAction,
  updateTaskAction,
} from "@/app/actions/tasks";
import { Button, EmptyState, Input, Select, Textarea } from "@/components/ui";
import type { Category, Task } from "@/generated/prisma/client";
import { applyCreatedTask, type CreateTaskResult, type TaskListItem } from "@/lib/task-list";
import { formatTaskTime } from "@/lib/task-time";
import { cn } from "@/lib/utils";

const STATUS_META: Record<Task["status"], { label: string; className: string }> = {
  TODO: { label: "Pendiente", className: "bg-muted text-muted-foreground" },
  IN_PROGRESS: { label: "En curso", className: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  DONE: { label: "Hecha", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
};

const PRIORITY_META: Record<Task["priority"], { label: string; className: string }> = {
  LOW: { label: "Baja", className: "bg-muted text-muted-foreground" },
  MEDIUM: { label: "Media", className: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  HIGH: { label: "Alta", className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  URGENT: { label: "Urgente", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
};

const STATUS_ORDER: Task["status"][] = ["TODO", "IN_PROGRESS", "DONE"];
const PRIORITY_ORDER: Task["priority"][] = ["URGENT", "HIGH", "MEDIUM", "LOW"];

function formatDue(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
  }).format(date);
}

type StatusFilter = "ALL" | Task["status"];

export function TasksClient({
  initialTasks,
  categories,
  today,
}: {
  initialTasks: Task[];
  categories: Category[];
  today: string;
}) {
  const [tasks, setTasks] = useState<TaskListItem[]>(initialTasks);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return [...tasks]
      .filter((task) =>
        statusFilter === "ALL" ? true : task.status === statusFilter,
      )
      .filter((task) =>
        categoryFilter === "ALL" ? true : task.categoryId === categoryFilter,
      )
      .filter((task) =>
        term
          ? task.title.toLowerCase().includes(term) ||
            (task.description ?? "").toLowerCase().includes(term)
          : true,
      )
      .sort((a, b) => {
        if (a.status === "DONE" && b.status !== "DONE") return 1;
        if (a.status !== "DONE" && b.status === "DONE") return -1;
        const aStatus = STATUS_ORDER.indexOf(a.status);
        const bStatus = STATUS_ORDER.indexOf(b.status);
        if (aStatus !== bStatus) return aStatus - bStatus;
        const aPriority = PRIORITY_ORDER.indexOf(a.priority);
        const bPriority = PRIORITY_ORDER.indexOf(b.priority);
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }, [tasks, statusFilter, categoryFilter, search]);

  function run(action: (formData: FormData) => Promise<{ ok: boolean; error?: string; id?: string }>, formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error ?? "Error al guardar.");
      }
    });
  }

  function handleToggle(task: TaskListItem) {
    const formData = new FormData();
    formData.set("id", task.id);

    const next = {
      ...task,
      status: task.status === "DONE" ? "TODO" : "DONE",
      completedAt: task.status === "DONE" ? null : new Date(),
    } as TaskListItem;

    setTasks((prev) => prev.map((item) => (item.id === task.id ? next : item)));
    run(toggleTaskAction, formData);
  }

  function handleDelete(task: TaskListItem) {
    setTasks((prev) => prev.filter((item) => item.id !== task.id));
    if (editingId === task.id) {
      setEditingId(null);
    }
    run(deleteTaskAction, formDataFromId(task.id));
  }

  function formDataFromId(id: string): FormData {
    const formData = new FormData();
    formData.set("id", id);
    return formData;
  }

  async function handleCreateTask(formData: FormData): Promise<CreateTaskResult> {
    setError(null);
    const result = await createTaskAction(formData);
    if (!result.ok) {
      setError(result.error ?? "Error al guardar.");
      return result;
    }

    startTransition(() => {
      setTasks((prev) => applyCreatedTask(prev, result));
    });
    return result;
  }

  const pendingCount = tasks.filter((task) => task.status !== "DONE").length;
  const doneCount = tasks.length - pendingCount;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tareas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {pendingCount} por hacer · {doneCount} completadas
          </p>
        </div>
        <NewTaskForm categories={categories} onCreate={handleCreateTask} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label htmlFor="search" className="sr-only">
            Buscar
          </label>
          <Input
            id="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar…"
            className="w-56"
          />
        </div>
        <Select
          aria-label="Filtrar por estado"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          className="w-40"
        >
          <option value="ALL">Todos los estados</option>
          <option value="TODO">Pendientes</option>
          <option value="IN_PROGRESS">En curso</option>
          <option value="DONE">Hechas</option>
        </Select>
        <Select
          aria-label="Filtrar por categoría"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="w-48"
        >
          <option value="ALL">Todas las categorías</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {tasks.length === 0 ? (
        <EmptyState
          title="Todavía no hay tareas"
          description="Crea la primera desde el formulario de arriba."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description="Ajusta los filtros o la búsqueda."
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              categories={categories}
              today={today}
              editing={editingId === task.id}
              isPending={isPending}
              onToggle={() => handleToggle(task)}
              onDelete={() => handleDelete(task)}
              onEdit={() => setEditingId(editingId === task.id ? null : task.id)}
              onSave={(formData) => {
                setEditingId(null);
                run(updateTaskAction, formData);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );

}

function NewTaskForm({
  categories,
  onCreate,
}: {
  categories: Category[];
  onCreate: (formData: FormData) => Promise<CreateTaskResult>;
}) {
  const [newCategory, setNewCategory] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      if (newCategory.trim()) {
        const catData = new FormData();
        catData.set("name", newCategory.trim());
        const category = await createCategoryAction(catData);
        if (category.ok && category.id) {
          formData.set("categoryId", category.id);
        }
      }
      const result = await onCreate(formData);
      if (!result.ok) {
        return;
      }

      form.reset();
      setNewCategory("");
    });
  }

  const [isPending, startTransition] = useTransition();

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input name="title" placeholder="Nueva tarea…" required maxLength={200} className="sm:col-span-2" />
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="new-category">
            Guardar como nueva categoría (opcional)
          </label>
          <Input
            id="new-category"
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            placeholder="Nueva categoría"
            maxLength={60}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="new-task-category">
            Categoría existente
          </label>
          <Select id="new-task-category" name="categoryId" defaultValue="">
            <option value="">Sin categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
        <Select name="priority" aria-label="Prioridad" defaultValue="MEDIUM">
          {Object.entries(PRIORITY_META).map(([value, meta]) => (
            <option key={value} value={value}>
              Prioridad {meta.label.toLowerCase()}
            </option>
          ))}
        </Select>
        <Input name="dueDate" type="date" aria-label="Fecha límite" />
        <Textarea name="description" placeholder="Notas de la tarea (opcional)" rows={2} className="sm:col-span-2" />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando…" : "Crear tarea"}
        </Button>
      </div>
    </form>
  );
}

function TaskRow({
  task,
  categories,
  today,
  editing,
  isPending,
  onToggle,
  onDelete,
  onEdit,
  onSave,
}: {
  task: TaskListItem;
  categories: Category[];
  today: string;
  editing: boolean;
  isPending: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSave: (formData: FormData) => void;
}) {
  const category = categories.find((item) => item.id === task.categoryId);
  const dueDate: string | null = task.dueDate
    ? task.dueDate.toISOString().slice(0, 10)
    : null;
  const overdue = dueDate !== null && dueDate < today;
  const dueToday = dueDate === today;

  return (
    <li className="rounded-xl border border-border bg-card p-3 transition-colors hover:border-muted-foreground/30">
      {editing ? (
        <EditTaskForm
          task={task}
          categories={categories}
          onSave={onSave}
          onCancel={onEdit}
        />
      ) : (
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onToggle}
            disabled={isPending}
            aria-label={task.status === "DONE" ? "Reabrir tarea" : "Completar tarea"}
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
              task.status === "DONE"
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-border hover:border-primary",
            )}
          >
            {task.status === "DONE" ? "✓" : null}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p
                className={cn(
                  "text-sm font-medium",
                  task.status === "DONE" && "text-muted-foreground line-through",
                )}
              >
                {task.title}
              </p>
              {dueToday ? (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  Hoy
                </span>
              ) : null}
              {overdue && task.status !== "DONE" ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                  Vencida
                </span>
              ) : null}
            </div>
            {task.description ? (
              <p className="mt-0.5 text-sm text-muted-foreground">{task.description}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_META[task.status].className)}>
                {STATUS_META[task.status].label}
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", PRIORITY_META[task.priority].className)}>
                {PRIORITY_META[task.priority].label}
              </span>
              {category ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  {category.name}
                </span>
              ) : null}
              {dueDate ? (
                <span className={cn("text-xs", overdue && task.status !== "DONE" ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                  Para {formatDue(dueDate)}
                </span>
              ) : null}
              <span className="text-xs text-muted-foreground">
                Tiempo invertido: {formatTaskTime(task.accumulatedSeconds)}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={isPending}
              className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              Borrar
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function EditTaskForm({
  task,
  categories,
  onSave,
  onCancel,
}: {
  task: TaskListItem;
  categories: Category[];
  onSave: (formData: FormData) => void;
  onCancel: () => void;
}) {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("id", task.id);
    onSave(formData);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Input name="title" defaultValue={task.title} required maxLength={200} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Select name="status" defaultValue={task.status}>
          {Object.entries(STATUS_META).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </Select>
        <Select name="priority" defaultValue={task.priority}>
          {Object.entries(PRIORITY_META).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </Select>
        <Select name="categoryId" defaultValue={task.categoryId ?? ""}>
          <option value="">Sin categoría</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>
      <Input
        name="dueDate"
        type="date"
        defaultValue={task.dueDate ? task.dueDate.toISOString().slice(0, 10) : ""}
      />
      <Textarea name="description" defaultValue={task.description ?? ""} rows={2} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">Guardar</Button>
      </div>
    </form>
  );
}
