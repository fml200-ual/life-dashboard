# Life Dashboard Constitution

Principios rectores del proyecto. Toda especificación (`spec.md`), plan técnico
y cambio de código se evalúa contra esta constitución. Deriva de las decisiones
ya adoptadas en [`architecture.md`](architecture.md) y [`MEMORY.md`](../MEMORY.md).

## Core Principles

### I. Cuenta única y mínimo privilegio (NO NEGOCIABLE)

El sistema sirve a **un único usuario** con registro cerrado. No existe (ni se
añadirá sin enmienda) un endpoint público de registro ni de multiusuario.

- Toda lectura o escritura de datos personales filtra por el usuario de sesión.
- La autorización se valida **siempre en el servidor** (`requireUser()` en
  layouts y Server Actions). El `proxy.ts` solo redirige de forma optimista.
- La sesión es opaca: token aleatorio en cookie `httpOnly`; en la base solo se
  guarda su hash (SHA-256).

**Rationale**: con una sola identidad, el riesgo real es la fuga o el acceso
cruzado; el control en servidor y la sesión opaca lo minimizan.

### II. Los datos personales no se cachean ni se exponen

- `cacheComponents` permanece desactivado en Next 16; las páginas con datos de
  sesión se renderizan dinámicamente.
- Ningún secreto (tokens de sesión, tokens OAuth, credenciales) llega al cliente
  ni al HTML; los tokens de integración se cifran en el servidor.
- Toda mutación llama a `revalidatePath` para refrescar los datos de servidor.

**Rationale**: son datos íntimos; un caché mal colocado los filtraría a otra
sesión o a un CDN.

### III. Serverless-first (apto para Vercel)

- En runtime la aplicación **solo requiere `DATABASE_URL`**. Acceso a datos vía
  Prisma 7 con driver adapter `pg` (sin motor local).
- El cliente Prisma se genera en `postinstall`; no se versiona.
- Los paquetes `@neon/*` se usan únicamente como Infrastructure-as-Code
  (`neon.ts`), nunca como dependencia de ejecución.
- El estado en memoria (p. ej. el rate limit) es **best-effort** y debe poder
  sustituirse por un almacén compartido sin cambiar su interfaz.

**Rationale**: el destino de despliegue es Vercel; cada instancia es efímera.

### IV. Las fechas "de día" son cadenas locales `YYYY-MM-DD`

- Los días de calendario (rachas, agrupaciones) se tratan como cadenas locales
  mediante `Intl.DateTimeFormat("en-CA", { timeZone })` (`src/lib/date.ts`).
- Los vencimientos (`dueDate`) se persisten a medianoche UTC de la clave local y
  se leen con partes UTC.
- Prohibido usar `new Date().toISOString().slice(0,10)` para obtener "hoy".

**Rationale**: evita el desfase de día entre la zona del usuario y la del
servidor. Ver skill `local-dates`.

### V. Simplicidad, YAGNI y no reinventar

- No se añade una dependencia sin justificar por qué lo que ya hay no sirve.
- Preferir Server Actions y utilidades propias frente a librerías nuevas.
- Código e identificadores en inglés; documentación y comentarios en español.
- Tailwind v4 se integra con `@tailwindcss/turbopack` en `next.config.ts`; no se
  cambia esa integración sin motivo documentado.

**Rationale**: el proyecto lo mantiene una persona; el coste de complejidad
innecesaria es alto.

### VI. Test-first para la lógica de dominio (NO NEGOCIABLE)

- Con **Vitest** (`npm run test`). La lógica pura (`date.ts`, `auth.ts`,
  validaciones, reducers/temporizador) debe tener tests antes o junto al cambio.
- Cada bug corregido deja al menos un test que lo habría detectado.
- Los tests no dependen de la red ni de una base real; se aíslan con dobles.

**Rationale**: la lógica de fechas y seguridad es propensa a errores sutiles.
_(Deuda reconocida: la cobertura actual es parcial; se cierra de forma
incremental, dando prioridad a `date.ts` y `auth.ts`.)_

### VII. Nada sensible se versiona

- `.env*`, `.vercel` y `.neon` están en `.gitignore`; no hay plantilla con
  credenciales en el repo.
- Antes de publicar (push) se verifica que no haya secretos en el diff.
- Los commit solo se hacen a petición explícita, sobre `main`.

**Rationale**: el repositorio es público.

## Restricciones técnicas

- **Stack**: Next.js 16 (App Router, `src/`), React 19, TypeScript, Tailwind CSS
  v4; PostgreSQL en Neon con Prisma 7 (`@prisma/adapter-pg`); Zod v4; `bcryptjs`.
- **Auth**: propia (no Auth.js), sesión `ld_session` (TTL 30 días).
- **Datos**: esquema en `prisma/schema.prisma`; migraciones versionadas en
  `prisma/migrations/`.
- **Middleware**: en Next 16 es `src/proxy.ts`. Consultar
  `node_modules/next/dist/docs/` antes de tocar APIs.

## Flujo de trabajo (Spec-Driven Development)

1. **Constitución** (este documento): una vez por proyecto; se enmienda cuando
   cambian los principios.
2. **Spec** por funcionalidad: `specs/NNN-nombre/spec.md` (el "qué" y el "por
   qué", sin implementación).
3. **Plan** técnico → **tareas** → **implementación** → **convergencia**
   (verificación contra la spec).

Puertas de calidad antes de cerrar cualquier cambio:

- `npm run lint` y `npm run typecheck` en verde (obligatorio).
- `npm run test` en verde cuando se toca lógica de dominio.
- Revisión de cumplimiento con esta constitución; la complejidad adicional debe
  justificarse.

## Governance

- Esta constitución **prevalece** sobre otras prácticas y convenciones.
- Toda funcionalidad nueva nace de una spec en `specs/`; sin spec no hay
  implementación (salvo correcciones triviales o de emergencia).
- Las enmiendas se documentan, se versionan con **SemVer** y se reflejan aquí.
- Reglas operativas y de contexto: [`MEMORY.md`](../MEMORY.md);
  detalle técnico: [`architecture.md`](architecture.md); guía para agentes:
  [`../AGENTS.md`](../AGENTS.md).

**Version**: 1.0.0 | **Ratified**: 2026-10-12 | **Last Amended**: 2026-10-12
