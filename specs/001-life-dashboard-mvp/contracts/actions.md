# Contracts — Server Actions

Firma pública de cada Server Action (`"use server"`). Todas las que mutan datos
verifican sesión con `getCurrentUser()` y filtran por `userId`; devuelven un
objeto `Result` en vez de lanzar. Las invocadas desde formularios con
`useActionState` reciben `(prevState, formData)`.

## `src/app/actions/auth.ts`

| Acción | Firma | Entrada | Salida | Efectos |
| ------ | ----- | ------- | ------ | ------- |
| `loginAction` | `(prevState: LoginState, formData: FormData) => Promise<LoginState>` | `email`, `password` | `{ error?: string }` o `redirect("/dashboard")` | Rate limit (IP+email) → `prisma.user.findUnique` → `verifyPassword` → `createSession` |
| `logoutAction` | `() => Promise<void>` | — | `redirect("/login")` | `destroySession()` |

- `LoginState = { error?: string }`.
- Errores: credenciales inválidas (mensaje genérico), rate limit, datos no válidos.
- **D3**: hoy **no** fija `timezone`; la especificación exige detectarla en el
  primer login.

## `src/app/actions/tasks.ts`

| Acción | Firma | Salida |
| ------ | ----- | ------ |
| `createTaskAction` | `(formData: FormData) => Promise<ActionResult>` | tarea creada |
| `updateTaskAction` | `(formData: FormData) => Promise<ActionResult>` | tarea actualizada |
| `toggleTaskAction` | `(formData: FormData) => Promise<ActionResult>` | estado alternado + día de racha |
| `deleteTaskAction` | `(formData: FormData) => Promise<ActionResult>` | borrado **definitivo** |
| `createCategoryAction` | `(formData: FormData) => Promise<ActionResult>` | categoría creada |

- Validación con `taskSchema` / `categorySchema` (Zod).
- `revalidatePath("/tasks")` y `/dashboard`.
- **D1/D2**: `taskPrioritySchema` incluye `URGENT` y `categoryId` es opcional;
  la spec exige 3 prioridades y categoría obligatoria.

## `src/app/actions/pomodoro.ts`

| Acción | Firma | Entrada | Salida |
| ------ | ----- | ------- | ------ |
| `completePomodoroAction` | `(formData: FormData) => Promise<PomodoroResult>` | `phase`, `plannedSeconds`, `endedAt`, `taskId?` | `{ ok, id?, error? }` |

- Valida `phase ∈ {WORK, SHORT_BREAK, LONG_BREAK}` y `plannedSeconds ∈ (0, 8h]`.
- Recalcula `startedAt = endedAt - plannedSeconds`; verifica que la tarea sea del
  usuario. `revalidatePath("/pomodoro")`, `/dashboard`.

## `src/app/actions/notes.ts`

| Acción | Firma | Entrada | Salida |
| ------ | ----- | ------- | ------ |
| `createNoteAction` | `(formData: FormData) => Promise<NoteResult>` | `title`, `content` | nota creada |
| `updateNoteAction` | `(formData: FormData) => Promise<NoteResult>` | `id`, `title`, `content` | nota actualizada (autoguardado) |
| `togglePinNoteAction` | `(formData: FormData) => Promise<NoteResult>` | `id` | fijado alternado |
| `deleteNoteAction` | `(formData: FormData) => Promise<NoteResult>` | `id` | borrado **definitivo** |

- Validación con `noteSchema` (título obligatorio, ≤ 200; contenido ≤ 50 000).

## `src/app/actions/settings.ts`

| Acción | Firma | Entrada | Salida |
| ------ | ----- | ------- | ------ |
| `updateAppearanceAction` | `(prevState: SettingsResult, formData: FormData) => Promise<SettingsResult>` | `theme`, `timezone` | guardado |
| `updatePomodoroSettingsAction` | `(prevState: SettingsResult, formData: FormData) => Promise<SettingsResult>` | duraciones, intervalo, objetivo, notificaciones | guardado |
| `updateThemeAction` | `(theme: string) => Promise<SettingsResult>` | `LIGHT`/`DARK`/`SYSTEM` | tema actualizado |

- `SettingsResult = { ok: boolean; error?: string; message?: string }`.
- `updateAppearanceAction` es el punto natural para **fijar la zona horaria**
  (FR-009/FR-014).

## Invariantes comunes

1. Sin sesión → `{ ok: false, error: "No autorizado." }` (salvo auth).
2. Toda escritura filtra por `userId` (constitución I).
3. Tras mutar → `revalidatePath` de las vistas afectadas (constitución II).
4. Ninguna acción expone secretos ni tokens al cliente.
