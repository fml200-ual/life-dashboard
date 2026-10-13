# MEMORY — Life Dashboard

Memoria persistente del proyecto: qué es, cómo se ejecuta, dónde vive y en qué
estado está. Mantenerlo conciso y actualizado.

> Fuente de verdad de convenciones: [`docs/constitution.md`](docs/constitution.md).
> Detalle técnico: [`docs/architecture.md`](docs/architecture.md).
> Especificaciones por funcionalidad (SDD): [`specs/`](specs/).

## Qué es

Panel personal de productividad con **una sola cuenta** (registro cerrado):
tareas con rachas por categoría, temporizador Pomodoro persistente, notas con
autoguardado y ajustes. Sin registro público ni multiusuario.

## Stack

- Next.js **16.4.0** (App Router, `src/`), React **19.3.0**, TypeScript, Tailwind CSS v4.
- PostgreSQL en **Neon** con **Prisma 7** (driver adapter `@prisma/adapter-pg`).
- Auth propia: cookie httpOnly `ld_session` (TTL 30 días), token opaco con hash
  SHA-256 en la tabla `Session`, contraseñas con `bcryptjs` (12 rondas).
  **No** se usa Auth.js.
- Validación con **Zod v4**.

## Comandos

| Comando               | Descripción                             |
| --------------------- | --------------------------------------- |
| `npm run dev`         | Servidor de desarrollo                  |
| `npm run build`       | Build de producción                     |
| `npm run start`       | Servidor de producción                  |
| `npm run lint`        | ESLint                                  |
| `npm run typecheck`   | `tsc --noEmit`                          |
| `npm run test`        | Tests (Vitest)                          |
| `npm run db:generate` | Regenera el cliente Prisma              |
| `npm run db:migrate`  | Crea/aplica migraciones (dev)           |
| `npm run db:deploy`   | Aplica migraciones (CI/CD)              |
| `npm run db:seed`     | Siembra la cuenta única y categorías    |
| `npm run db:studio`   | Prisma Studio                           |

Antes de cerrar un cambio: `npm run lint` y `npm run typecheck` (y `npm run test`
si se toca lógica).

## Entorno

- `.env` (no versionado): `DATABASE_URL` (pooled, `sslmode=require`) y
  `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` / `ADMIN_TIMEZONE`.
- Los paquetes `@neon/*` solo se usan en `neon.ts` (Infra-as-code); en runtime
  solo se necesita `DATABASE_URL`.
- Nunca versionar secretos: `.env*`, `.vercel` y `.neon` están en `.gitignore`.

## Infraestructura

- **Neon**: proyecto `hidden-mode-50556987`, branch `production`
  (`br-dark-snow-ba2hi3vl`), database `neondb`. Tablas migradas + seed aplicado.
- **Vercel**: https://life-dashboard-orcin-theta.vercel.app — proyecto
  `prj_EvrL6dMpeyXFiusGwwUgDHY7de3h`, equipo `team_Ixa2i5q42hIQGIiCNyIxkRKW`
  ("Javi's projects"). `DATABASE_URL` (pooled, la misma de `.env`) definida en
  **Production** y **Preview**; apunta a la Neon `production`. `/api/health`
  responde `{"status":"ok"}` pero **solo ejecuta `SELECT 1`**, así que no
  detecta un esquema vacío: valida conexión, no tablas.
- **Integración Neon/Vercel (ojo)**: las variables `POSTGRES_URL` y
  `PRISMA_DATABASE_URL` las inyecta la integración y siguen apuntando a una base
  vacía; ninguna se usa en runtime (la app solo lee `DATABASE_URL`).
- **Re-deploy por CLI**: `vercel redeploy` falla con `git_info_fail` ("Git
  information retrieval failed"); el proyecto está conectado a GitHub
  (`fml200-ual/life-dashboard`). Para redesplegar sin Git: desplegar desde una
  copia limpia del código commiteado (`git archive HEAD`) con `vercel --prod`.

## Arquitectura (resumen)

- Rutas optimistas en `src/proxy.ts` (el antiguo middleware en Next 16); la
  autorización real se valida siempre en servidor con `requireUser()` en layouts
  y acciones.
- Datos: `src/lib/db.ts` (Prisma + `PrismaPg`). El cliente se genera en
  `src/generated/prisma` (gitignored) y se regenera en `postinstall`.
- Fechas "de día" como cadenas locales `YYYY-MM-DD` (`src/lib/date.ts`);
  `dueDate` se guarda a medianoche UTC. Ver skill `local-dates`.
- Pomodoro basado en timestamps (`endAt`), reanudable dentro de 24 h; la spec
  [`002-pomodoro-autostart-task-time`](specs/002-pomodoro-autostart-task-time/spec.md)
  añade auto-avance desactivado por defecto, pausa/reanudación, notificaciones
  best-effort y asignación opcional de tareas a focos WORK. Se persisten los
  segundos activos por sesión y el acumulado por tarea, sin contar pausas ni
  completar tareas automáticamente. El selector queda bloqueado mientras la
  sesión está activa o pausada; los focos WORK automáticos conservan la tarea.
- La migración aditiva `20261013120000_pomodoro_autostart_task_time` está aplicada
  y validada según T002 de la spec; añade `UserPreferences.autoAdvance` (false),
  `PomodoroSession.actualSeconds` (0) y `Task.accumulatedSeconds` (0). La lista
  de tareas y el dashboard muestran el acumulado con formato compartido.
- `cacheComponents` desactivado (Next 16) para no cachear datos personales.

## Estado

- **Hecho**: sprints 0-3 (auth, shell + tema, tareas, pomodoro, notas, ajustes,
  dashboard, health); migración + seed; despliegue en Vercel; health OK.
- **Resuelto (login 500 en Vercel)**: el `POST /login` devolvía **500** con
  `prisma.user.findUnique()` lanzando **Prisma P2021** (`The table
  public."User" does not exist`). La causa **no** era Next/FormData (el
  `TypeError: Failed to parse body as FormData` / React #441 era un síntoma
  enmascarado en el cliente), sino que Vercel usaba un `DATABASE_URL`
  (inyectado por la integración Neon/Vercel) apuntando a una base **vacía**.
  Arreglo: redefinir `DATABASE_URL` en Vercel con la URL pooled de `.env` y
  redesplegar. Verificado: login redirige a `/dashboard` con el usuario seed.
- **Estado de spec**: T001–T009 de `002-pomodoro-autostart-task-time` tienen
  gates automatizadas verdes; tras dos vueltas de correcciones post-revisión, la
  suite tiene 100 tests y pasan lint, typecheck, build y diff-check. El parser
  conserva el tiempo deducible de estados Pomodoro legacy; si falta el instante
  original, no se reconstruye desde la duración planificada. Pausar/abandonar
  durante un registro en vuelo detiene el auto-avance, pero no revierte una fase
  cuyo registro ya fue enviado. Se preserva el inicio real de fases nuevas al
  cruzar medianoche y el resumen usa segundos activos con fallback planificado
  solo para sesiones legacy. No se desplegó la aplicación como parte de T009.
  La revisión visual/manual autenticada del ciclo y `/tasks`/dashboard fue
  delegada explícitamente al usuario y sigue pendiente de feedback.
- **Pendiente**: limpieza de sesiones vencidas, integración Gmail/OAuth,
  etiquetas (`Tag`).
