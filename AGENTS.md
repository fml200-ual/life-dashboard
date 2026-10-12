<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Life Dashboard — guía para agentes

Responde en **español**. El contexto del proyecto, las decisiones y la
infraestructura están en [`MEMORY.md`](MEMORY.md); las convenciones y el
"contrato" del proyecto, en [`docs/constitution.md`](docs/constitution.md).
**Léelos antes de trabajar.** Detalle técnico en
[`docs/architecture.md`](docs/architecture.md).

## Reglas rápidas

- Antes de cerrar un cambio: `npm run lint` y `npm run typecheck` (y
  `npm run test` si tocas lógica).
- No versionar secretos: `.env*`, `.vercel`, `.neon` están en `.gitignore`.
- Fechas "de día" como cadenas locales `YYYY-MM-DD` (skill `local-dates`).
- Tailwind v4 se integra con `@tailwindcss/turbopack` en `next.config.ts`;
  no cambiarlo sin motivo.
- Next 16: el middleware se llama `proxy.ts`. Lee la guía en
  `node_modules/next/dist/docs/` antes de tocar APIs.
- Ramas: trabajo sobre `main`; no commitear salvo petición explícita.

## SDD (Spec-Driven Development)

- Antes de implementar una funcionalidad, escribe o actualiza su spec en
  `specs/NNN-nombre/spec.md` (el "qué" y el "por qué"), alineada con la
  constitución.
- Orden: constitución → spec → plan → tareas → implementación → convergencia.
- Cada cambio debe cumplir [`docs/constitution.md`](docs/constitution.md).
