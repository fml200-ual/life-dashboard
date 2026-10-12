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
- **Vercel**: https://life-dashboard-orcin-theta.vercel.app — desplegado desde el
  dashboard, con `DATABASE_URL` definida en **Production**. `/api/health` responde
  `{"status":"ok"}` (valida conexión a la base).

## Arquitectura (resumen)

- Rutas optimistas en `src/proxy.ts` (el antiguo middleware en Next 16); la
  autorización real se valida siempre en servidor con `requireUser()` en layouts
  y acciones.
- Datos: `src/lib/db.ts` (Prisma + `PrismaPg`). El cliente se genera en
  `src/generated/prisma` (gitignored) y se regenera en `postinstall`.
- Fechas "de día" como cadenas locales `YYYY-MM-DD` (`src/lib/date.ts`);
  `dueDate` se guarda a medianoche UTC. Ver skill `local-dates`.
- Pomodoro basado en timestamps (`endAt`), reanudable dentro de 24 h.
- `cacheComponents` desactivado (Next 16) para no cachear datos personales.

## Estado

- **Hecho**: sprints 0-3 (auth, shell + tema, tareas, pomodoro, notas, ajustes,
  dashboard, health); migración + seed; despliegue en Vercel; health OK.
- **Bloqueante en curso**: `POST /login` devuelve **500** con
  `TypeError: Failed to parse body as FormData.` (React #441). Sospecha de
  regresión de Next 16.4.0 + Turbopack en Server Actions/FormData. La app no es
  usable hasta resolverlo.
- **Pendiente**: tests (Vitest), limpieza de sesiones vencidas, integración
  Gmail/OAuth, etiquetas (`Tag`).
