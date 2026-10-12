# Fase 1 — Data Model: Life Dashboard (MVP)

Modelo de datos derivado de [`spec.md`](./spec.md) y materializado en
`prisma/schema.prisma` (PostgreSQL). Se documenta aquí lo que la spec exige y las
**brechas** detectadas en el `Constitution Check`.

## Resumen de entidades

| Entidad             | Propósito                                            | Relaciones clave                     |
| ------------------- | ---------------------------------------------------- | ------------------------------------ |
| `User`              | Propietario único                                    | 1—N con todo lo demás                |
| `Session`           | Sesión opaca (hash de token)                         | N—1 `User`                           |
| `UserPreferences`   | Preferencias (tema, Pomodoro, objetivo, notificaciones) | 1—1 `User`                        |
| `Category`          | Agrupación de tareas; base de las rachas             | N—1 `User`; 1—N `Task`/`StreakDay`   |
| `Task`              | Tarea con estado/prioridad/vencimiento               | N—1 `User`, N—1 `Category` (opt→**req**) |
| `Tag`               | Etiqueta (fase posterior)                            | N—1 `User`                           |
| `TaskTag` / `NoteTag` | Tablas puente M—N                                  | —                                    |
| `StreakDay`         | Día de actividad por (usuario, categoría)            | N—1 `User`, N—1 `Category`           |
| `PomodoroSession`   | Sesión de temporizador completada                    | N—1 `User`, N—1 `Task` (opcional)    |
| `Note`              | Nota con título + contenido y fijado                 | N—1 `User`                           |
| `IntegrationConfig` | Config de OAuth (fase posterior; tokens cifrados)    | N—1 `User`                           |

## Enumeraciones

| Enum                | Valores                                  | Nota                         |
| ------------------- | ---------------------------------------- | ---------------------------- |
| `TaskStatus`        | `TODO`, `IN_PROGRESS`, `DONE`            | = pendiente / en curso / hecha |
| `TaskPriority`      | `LOW`, `MEDIUM`, `HIGH`, `URGENT`        | **D1**: la spec pide 3 (quitar `URGENT`) |
| `PomodoroPhase`     | `WORK`, `SHORT_BREAK`, `LONG_BREAK`      | —                            |
| `ThemePreference`   | `LIGHT`, `DARK`, `SYSTEM`                | —                            |
| `IntegrationProvider` | `GOOGLE`                               | fase posterior               |

## Detalle por entidad (campos relevantes)

### User
`id` (cuid), `email` (único), `name?`, `passwordHash`, `timezone`
(actualmente `default("Europe/Madrid")`), timestamps.
→ **D3**: la spec exige **autodetectar** la zona en el primer login (FR-014).

### Session
`tokenHash` (único), `expiresAt`, `userAgent?`. TTL 30 días
(`SESSION_TTL_DAYS`). Se guarda **solo el hash**; el token nunca se persiste.

### UserPreferences
`theme` (`SYSTEM`), `workMinutes` (25), `shortBreakMinutes` (5),
`longBreakMinutes` (15), `longBreakInterval` (4), `dailyPomodoroGoal` (8),
`notificationsEnabled` (true). 1—1 con `User`.

### Category
`name` + `color`; `@@unique([userId, name])`. Borrar una categoría en cascada
arrastra sus `StreakDay` y pone `categoryId = null` en tareas
(`onDelete: SetNull`) → **D2** cambia esto a obligatorio.

### Task
`title`, `description?`, `status` (`TODO`), `priority` (`MEDIUM`),
`dueDate?` (medianoche UTC), `completedAt?`, `categoryId?` (→ **D2**: requerido),
índices `(userId,status)`, `(userId,dueDate)`, `(categoryId)`.
**Borrado definitivo** (sin campo de archivado), conforme a la clarificación.

### StreakDay
`date` como **cadena local `YYYY-MM-DD`**; `@@unique([userId, categoryId, date])`.
Se incrementa al completar tareas de la categoría (ver `computeStreak()`).

### PomodoroSession
`phase` (`WORK`), `plannedSeconds`, `startedAt`, `endedAt?`, `completed`.
El cliente envía `plannedSeconds` + `endedAt`; el backend recalcula `startedAt`.

### Note
`title` (**no vacío**), `content` (por defecto `""`), `pinned`.
**D4 (modelo)**: coincide con la spec (título + contenido). Borrado definitivo.

### IntegrationConfig / Tag / TaskTag / NoteTag
Ya en el esquema para la **fase posterior** (Gmail/OAuth y etiquetas). No forman
parte de los requisitos obligatorios del MVP; se marcan como fuera de alcance v1.

## Integridad y reglas

- Toda entidad de dominio lleva `userId`; **todas** las consultas de escritura
  filtran por el usuario de sesión (constitución I).
- Cascadas: borrar `User` arrastra todo. `Task.categoryId` pasará a `Restrict`
  (impedir borrar una categoría con tareas) o `Cascade` según decisión en tareas.
- Fechas "de día" como `String` local; vencimientos como `DateTime` UTC.

## Migración requerida (Fase 2)

1. **D1**: quitar `URGENT` de `TaskPriority` (enum + `validations.ts` + UI).
2. **D2**: `Task.categoryId` `String` (no nulo) + `onDelete: Restrict`/`Cascade`;
   backfill de tareas sin categoría (asignar una categoría real) antes de aplicar.
3. **D3**: sin cambio de esquema si se mantiene `default`; el cambio es de
   comportamiento (setear `timezone` con la del navegador en el primer login).
