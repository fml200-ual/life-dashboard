# Fase 0 — Research: Life Dashboard (MVP)

Decisiones técnicas adoptadas y alternativas descartadas. El MVP ya está
construido; esto documenta el **porqué** para que futuras specs no lo rediscutan.
Las incógnitas de negocio se resolvieron en la fase *Clarify* (ver la sección
`## Clarifications` de [`spec.md`](./spec.md)).

## Decisión 1 — Middleware como `proxy.ts`

- **Decisión**: la comprobación optimista de sesión vive en `src/proxy.ts`.
- **Rationale**: en Next.js 16 el middleware pasó a llamarse `proxy`; el matcher
  excluye estáticos e imágenes.
- **Alternativa descartada**: `middleware.ts` (convención anterior, deprecada).
- **Nota**: no es seguridad, solo redirección; la autorización real es
  `requireUser()` en servidor.

## Decisión 2 — Autenticación propia (sesión opaca)

- **Decisión**: cookie `ld_session` con token `randomBytes(32)`; en BD solo el
  hash SHA-256 (`Session.tokenHash`); contraseñas con `bcryptjs` (12 rondas).
- **Rationale**: cuenta única; no hay necesidad de proveedores ni de registro.
- **Alternativa descartada**: Auth.js / NextAuth (sobredimensionado; añade
  dependencias y superficie).

## Decisión 3 — Prisma 7 con driver adapter `pg`

- **Decisión**: `@prisma/adapter-pg` sobre `pg`, cliente generado en
  `src/generated/prisma` (gitignored, regenerado en `postinstall`).
- **Rationale**: funciona en serverless (Vercel) sin motor local; en runtime
  solo requiere `DATABASE_URL`.
- **Alternativa descartada**: driver `@neondatabase/serverless` (válido, pero el
  adapter `pg` es portable y ya soporta pooling de Neon). SQL crudo (sin
  tipado/migraciones).

## Decisión 4 — Fechas "de día" como cadenas locales

- **Decisión**: los días de calendario son cadenas `YYYY-MM-DD` en la zona del
  usuario (`Intl.DateTimeFormat("en-CA", { timeZone })`); `dueDate` se persiste a
  medianoche UTC de la clave local.
- **Rationale**: evitar que la conversión a UTC desplace el día.
- **Alternativa descartada**: almacenar `Date` en UTC y derivar "hoy" en el
  servidor (desfase garantizado con otra zona).

## Decisión 5 — Pomodoro por instante de fin (`endAt`)

- **Decisión**: el temporizador guarda el epoch de fin en `localStorage`; al
  reabrir antes de 24 h se recalcula el restante; al terminar, la Action registra
  `PomodoroSession` (el backend recalcula `startedAt`).
- **Rationale**: sobrevive al cierre de pestaña sin contar segundos en el servidor.
- **Alternativa descartada**: contador en servidor (coste/estado innecesario) o
  solo en memoria (se pierde al recargar).

## Decisión 6 — Rate limit en memoria (best-effort)

- **Decisión**: `src/lib/rate-limit.ts` con `Map` (5 intentos / 15 min por
  IP+email).
- **Rationale**: suficiente para cuenta única; sin dependencias externas.
- **Alternativa descartada**: Upstash/Redis (coste y complejidad no justificados
  todavía). La interfaz permite migrar sin cambiar a los llamadores.

## Decisión 7 — Tailwind v4 vía `@tailwindcss/turbopack`

- **Decisión**: integración en `next.config.ts` con el plugin de Turbopack.
- **Rationale**: es el soporte oficial en Tailwind v4 con Next 16.
- **Alternativa descartada**: PostCSS manual (fricción y errores de build).

## Incógnitas resueltas (fase Clarify, 2026-10-12)

- Estado: `pendiente` / `en curso` / `hecha`; prioridad: `baja` / `media` / `alta`.
- Categoría **obligatoria** al crear tarea. → genera **D2**.
- Borrado **definitivo** (sin papelera) para tareas y notas.
- Zona horaria **autodetectada** en el primer login, editable. → genera **D3**.
- Nota con **título + contenido**.

## Riesgo abierto (no de esta spec)

- **Login `POST /login` → 500** (`Failed to parse body as FormData.`) en el
  despliegue. Es un defecto de plataforma/entorno, no un requisito del MVP; se
  trata como **bug** (ver flujo bug-fixing) y no cambia el alcance de la spec,
  pero bloquea la verificación de SC-001/SC-002.
