# Tasks — Life Dashboard (MVP)

**Feature**: `001-life-dashboard-mvp` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**Tipo**: **retrospectivo**. `[x]` = ya implementado y verificado en el repo;
`[ ]` = pendiente (brechas de convergencia **D1–D4** y mantenimiento).

**Formato**: `- [x] T### [P?] [US#?] Descripción — ruta`

- `[P]` = paralelizable (archivos distintos, sin dependencias).
- `[US#]` = user story de la spec.

## Leyenda de estados

| Marca | Significado                     |
| ----- | ------------------------------- |
| `[x]` | Implementado (retrospectivo)    |
| `[ ]` | Pendiente                       |

---

## Fase 1 — Setup (proyecto)

- [x] T001 Crear proyecto Next.js 16 (App Router, `src/`, TypeScript) — `package.json`, `tsconfig.json`, `next.config.ts`
- [x] T002 Integrar Tailwind CSS v4 con `@tailwindcss/turbopack` — `next.config.ts`, `src/app/globals.css`
- [x] T003 Declarar dependencias (Prisma 7 + `@prisma/adapter-pg`, `pg`, `zod`, `bcryptjs`, `server-only`) — `package.json`
- [x] T004 Configurar generador Prisma a `src/generated/prisma` y CLI — `prisma/schema.prisma`, `prisma7.config.ts`
- [x] T005 Ignorar secretos y artefactos — `.gitignore` (`.env*`, `.vercel`, `.neon`)
- [x] T006 Definir scripts (`dev`, `build`, `lint`, `typecheck`, `test`, `db:*`) — `package.json`

## Fase 2 — Foundational (núcleo, bloquea todo lo demás)

- [x] T010 Definir esquema de datos (User, Session, UserPreferences, Category, Task, Tag, Note, PomodoroSession, StreakDay, IntegrationConfig) — `prisma/schema.prisma`
- [x] T011 Crear migración inicial — `prisma/migrations/20261012100418_init/`
- [x] T012 Cliente Prisma singleton con adapter `pg` — `src/lib/db.ts`
- [x] T013 Constantes de sesión (`ld_session`, TTL 30 días) — `src/lib/constants.ts`
- [x] T014 Esquemas de validación Zod — `src/lib/validations.ts`
- [x] T015 Utilidades de fecha local `YYYY-MM-DD` + `computeStreak()` — `src/lib/date.ts`
- [x] T016 Librería de auth (hash/verify, `createSession`, `destroySession`, `requireUser`, `getCurrentUser`) — `src/lib/auth.ts`
- [x] T017 Rate limit en memoria (login) — `src/lib/rate-limit.ts`
- [x] T018 Seed de cuenta única + 4 categorías — `prisma/seed.ts`
- [x] T019 Layout raíz + script de tema — `src/app/layout.tsx`, `src/lib/theme.ts`
- [x] T020 Protección optimista de rutas — `src/proxy.ts`

## Fase 3 — US1: Acceso a la cuenta única (P1)

- [x] T030 [US1] Página y formulario de login con `useActionState` — `src/app/(auth)/login/page.tsx`, `login-form.tsx`
- [x] T031 [US1] `loginAction` / `logoutAction` (rate limit + sesión) — `src/app/actions/auth.ts`
- [x] T032 [US1] Layout autenticado con `requireUser()` + preferencias — `src/app/(app)/layout.tsx`
- [x] T033 [US1] Shell de la app + sincronización de tema — `src/components/app-shell.tsx`, `theme-sync.tsx`
- [x] T034 [US1] Redirección raíz `/` → login/dashboard — `src/app/page.tsx`
- [ ] T035 [US1] **D3**: autodetectar zona horaria del navegador en el primer login (FR-014) — `src/app/actions/auth.ts`, `src/lib/auth.ts`

## Fase 4 — US2: Tareas, categorías y rachas (P2)

- [x] T040 [US2] Acciones de tareas y categorías — `src/app/actions/tasks.ts`
- [x] T041 [US2] UI de tareas (listado, filtros, estados) — `src/app/(app)/tasks/`
- [x] T042 [US2] Registro del día de racha al completar (`StreakDay`) — `src/app/actions/tasks.ts`, `src/lib/date.ts`
- [x] T043 [US2] CRUD de categorías — `src/app/actions/tasks.ts`, `src/app/(app)/tasks/`
- [ ] T044 [US2] **D1**: eliminar prioridad `URGENT` (3 prioridades) — `prisma/schema.prisma`, `src/lib/validations.ts`, UI
- [ ] T045 [US2] **D2**: categoría obligatoria (migración + backfill + Zod + UI) — `prisma/schema.prisma`, `src/lib/validations.ts`

## Fase 5 — US3: Pomodoro persistente (P3)

- [x] T050 [US3] Acción `completePomodoroAction` (recalcula `startedAt`) — `src/app/actions/pomodoro.ts`
- [x] T051 [US3] Temporizador por `endAt` en `localStorage` (< 24 h) — `src/app/(app)/pomodoro/`
- [x] T052 [US3] Estadísticas (hoy/total) y descanso largo — `src/app/(app)/pomodoro/`

## Fase 6 — US4: Notas con autoguardado (P4)

- [x] T060 [US4] Acciones de notas (crear/actualizar/fijar/borrar) — `src/app/actions/notes.ts`
- [x] T061 [US4] UI de notas con autoguardado (debounce) y fijado — `src/app/(app)/notes/`

## Fase 7 — US5: Preferencias y dashboard (P5)

- [x] T070 [US5] Acciones de ajustes (apariencia, Pomodoro, tema) — `src/app/actions/settings.ts`
- [x] T071 [US5] Página de ajustes (tema, zona, Pomodoro) — `src/app/(app)/settings/`
- [x] T072 [US5] Dashboard (resumen, rachas, próximos vencimientos) — `src/app/(app)/dashboard/page.tsx`

## Fase 8 — Polish, verificación y despliegue

- [x] T080 Health check — `src/app/api/health/route.ts`
- [x] T081 Documentación (README + arquitectura) — `README.md`, `docs/architecture.md`
- [x] T082 Despliegue en Vercel (dashboard) + `DATABASE_URL` en Production
- [x] T083 Documentación SDD (constitución, spec, plan, data-model, contratos) — `docs/constitution.md`, `specs/001-life-dashboard-mvp/`
- [x] T084 [P] **D4**: alta de Vitest + tests de `date.ts`, `auth.ts`, `validations.ts` (Principio VI) — `tests/unit/`, `vitest.config.mts`
- [ ] T085 Corregir bug de login `POST /login` → 500 (`Failed to parse body as FormData.`) — flujo *bug-fixing*
- [ ] T086 Limpieza programada de sesiones vencidas (mantenimiento, fase posterior)
- [ ] T087 Integración Gmail/OAuth con tokens cifrados (fuera de alcance v1) — `IntegrationConfig`

---

## Dependencias

- **Fase 2 bloquea** las fases 3–7 (esquema, auth, fechas).
- **US1 (P1)** bloquea US2–US5 (todo requiere sesión).
- Dentro de US2: T044 y T045 son independientes entre sí (**[P]**), pero T045
  requiere **backfill** de tareas sin categoría antes de aplicar la migración.
- **T084 (D4)** y **T085 (bug login)** son independientes y paralelizables.
- **T086/T087** no bloquean la entrega del MVP.

## Estrategia de ejecución

- La mayoría está **implementado** (retrospectivo); el trabajo pendiente es de
  **convergencia**: D1–D4 + el bug de login.
- Orden sugerido: **T084 ✅ (hecho)** → **T085** (desbloquea el uso real) →
  **T044/T045** (D1/D2, con migración) → **T035** (D3).
- Criterio de convergencia: código conforme a `spec.md` + `plan.md`, gates de la
  constitución en verde (VI deja de estar en VIOLATION cuando T084 esté hecho).

## Recuento

- **Implementadas**: 39 tareas (`[x]`).
- **Pendientes**: 6 tareas (`[ ]`): T035, T044, T045, T085, T086, T087.
