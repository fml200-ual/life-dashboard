# Implementation Plan: Life Dashboard (MVP)

**Branch**: `001-life-dashboard-mvp` | **Date**: 2026-10-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-life-dashboard-mvp/spec.md`

**Nota**: plan **retrospectivo**. El MVP ya está implementado; este documento fija
el diseño técnico de referencia y explicita las **brechas de convergencia**
entre la spec (ya clarificada) y el código actual.

## Summary

Aplicación **web full-stack de cuenta única**. Enfoque técnico: Next.js 16
(App Router) con **Server Actions** y render en servidor por sesión; **Prisma 7**
sobre PostgreSQL (Neon) con driver adapter `pg`; **autenticación propia** con
sesión opaca en cookie `httpOnly`; **disciplina de fechas locales** `YYYY-MM-DD`;
despliegue en **Vercel** (en runtime solo se necesita `DATABASE_URL`).

## Technical Context

**Language/Version**: TypeScript 5; Node 22 (dev y runtime Vercel).

**Primary Dependencies**: Next.js 16.4.0, React 19.3.0, Tailwind CSS v4
(`@tailwindcss/turbopack`), Prisma 7 (`@prisma/adapter-pg`, `pg`), Zod v4,
`bcryptjs`.

**Storage**: PostgreSQL gestionado en Neon (branch `production`); migraciones
Prisma versionadas en `prisma/migrations/`.

**Testing**: Vitest (`npm run test`). Unitarias para lógica pura
(`date.ts`, `auth.ts`, `validations.ts`) con dobles; sin red ni base real.

**Target Platform**: serverless en Vercel + navegadores modernos (usa
`localStorage` para el Pomodoro).

**Project Type**: web (full-stack, un único proyecto Next en `src/`).

**Performance Goals**: `/api/health` con base disponible < 2 s (SC-006); login →
dashboard < 2 min (SC-001). Sin objetivo de alta concurrencia (uso personal).

**Constraints**: runtime solo `DATABASE_URL`; **no** cachear datos personales
(`cacheComponents: false`); rate limit best-effort; secretos fuera del
repositorio; fechas sin desfase por zona.

**Scale/Scope**: 1 usuario; ~7 rutas; 9 entidades; 1 idioma (UI en español).

## Constitution Check

*GATE: obligatorio antes de Fase 0 y re-evaluado tras Fase 1.*

| Principio (constitución)                 | Estado   | Nota                                                        |
| ---------------------------------------- | -------- | ----------------------------------------------------------- |
| I. Cuenta única y mínimo privilegio      | PASS     | `proxy.ts` optimista + `requireUser()`; queries por `userId` |
| II. Datos personales no se cachean       | PASS     | `cacheComponents: false`; páginas dinámicas por sesión      |
| III. Serverless-first                    | PASS     | Solo `DATABASE_URL`; adapter `pg`. Rate limit best-effort   |
| IV. Fechas "de día" locales              | PASS     | `src/lib/date.ts`; `dueDate` a medianoche UTC               |
| V. Simplicidad / YAGNI                   | PASS     | —                                                           |
| VI. Test-first para lógica de dominio    | PASS     | Vitest + 34 tests (`date.ts`, `auth.ts`, `validations.ts`) — D4 ✅ |
| VII. Nada sensible versionado            | PASS     | `.env*`, `.vercel`, `.neon` ignorados                       |

### Sincronización spec ↔ código (brechas de convergencia)

- **D1 — Prioridades**: el esquema tiene 4 (`LOW`, `MEDIUM`, `HIGH`, `URGENT`),
  pero la spec exige 3 (`baja` / `media` / `alta`). Eliminar `URGENT` en
  `schema.prisma`, `validations.ts` y UI.
- **D2 — Categoría obligatoria**: hoy `Task.categoryId` es opcional
  (`onDelete: SetNull`); la spec exige **categoría obligatoria**. Requiere
  migración: `categoryId String` + `onDelete: Restrict` (o `Cascade`), y
  validación Zod que la exija.
- **D3 — Zona horaria**: `User.timezone` por defecto `Europe/Madrid` y sin
  autodetección; la spec exige **autodetectar el navegador en el primer login**
  (FR-014) y persistirla, editable en Ajustes.
- **D4 — Cobertura de tests**: ✅ **resuelto** (T084): Vitest + tests de
  `date.ts`, `auth.ts`, `validations.ts` (34 tests en verde).

Estas brechas se convierten en tareas de la Fase 2 (`tasks.md`) y se verifican en
la fase de **convergencia**.

## Project Structure

### Documentation (this feature)

```text
specs/001-life-dashboard-mvp/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones técnicas
├── data-model.md        # Fase 1: modelo de datos
├── quickstart.md        # Fase 1: puesta en marcha y verificación
├── contracts/           # Fase 1: rutas y Server Actions
│   ├── routes.md
│   └── actions.md
└── tasks.md             # Fase 2 (comando /tasks) — aún no creado
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── (auth)/login/          # Página + formulario de acceso
│   ├── (app)/                 # Sección autenticada
│   │   ├── dashboard/
│   │   ├── tasks/
│   │   ├── pomodoro/
│   │   ├── notes/
│   │   └── settings/
│   ├── actions/               # Server Actions (auth, tasks, pomodoro, notes, settings)
│   ├── api/health/route.ts    # Health check (conecta a la BD)
│   ├── layout.tsx
│   └── page.tsx               # / → redirige a login o dashboard
├── components/                # Shell + UI base
├── lib/                       # auth, db, date, rate-limit, validations, theme
├── generated/prisma/          # Cliente Prisma (gitignored; postinstall)
└── proxy.ts                   # Protección optimista de rutas (antiguo middleware)

prisma/
├── schema.prisma
├── migrations/
└── seed.ts

tests/                         # (a crear) unit de date/auth/validations
```

**Structure Decision**: **Opción 1 — un solo proyecto Next.js**. Route groups
`(auth)` y `(app)` separan lo público de lo privado; la lógica de dominio vive en
`src/lib`; las mutaciones pasan por Server Actions en `src/app/actions`. Sin
backend separado: la app es serverless y habla directo con Postgres.

## Complexity Tracking

| Violation                              | Why Needed                                                             | Simpler Alternative Rejected Because                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| VI. Cobertura de tests incompleta (D4) | Fechas y auth son propensas a errores sutiles; los tests son la red de seguridad | Omitir tests: ya hubo que depurar un fallo de login; sin tests, la recurrencia es probable          |

## Fases de diseño

- **Fase 0 (Research)** → [`research.md`](./research.md): decisiones y
  alternativas descartadas.
- **Fase 1 (Design)** → [`data-model.md`](./data-model.md),
  [`contracts/`](./contracts/), [`quickstart.md`](./quickstart.md).
- **Fase 2 (Tasks)** → `tasks.md` (incluye D1–D4 y el endurecimiento del login).
- **Convergencia**: verificar el código contra spec + plan; cerrar brechas.

## Re-check (post-Fase 1)

Los gates de la constitución se mantienen: **I–VII en PASS** (VI se cerró con
D4). El plan no introduce complejidad nueva que requiera justificación
adicional. Quedan abiertas las brechas **D1–D3** (tareas T044, T045, T035).
