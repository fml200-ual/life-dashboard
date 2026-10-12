# Quickstart — Life Dashboard (MVP)

Puesta en marcha local y verificación de los escenarios de la
[`spec.md`](./spec.md).

## Requisitos

- Node.js 20+ (probado con 22).
- Un PostgreSQL (Neon). No hace falta motor local.

## Configuración

1. Crea `.env` (no se versiona) con:
   ```bash
   DATABASE_URL="postgresql://...:...@...-pooler...aws.neon.tech/neondb?sslmode=require"
   ADMIN_EMAIL="..."
   ADMIN_PASSWORD="..."
   ADMIN_NAME="..."
   ADMIN_TIMEZONE="Europe/Madrid"
   ```
2. Instala y prepara datos:
   ```bash
   npm install          # postinstall regenera el cliente Prisma
   npm run db:migrate   # crea/aplica migraciones (dev)
   npm run db:seed      # cuenta única + 4 categorías
   ```
3. Desarrollo:
   ```bash
   npm run dev          # http://localhost:3000
   ```

## Calidad

```bash
npm run lint
npm run typecheck
npm run test      # Vitest (lógica de dominio)
```

## Verificación por escenario

| Escenario (spec)                    | Cómo comprobar                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| **US1** Login y sesión              | Entrar con la cuenta → `/dashboard`; ruta privada sin sesión → `/login`; logout → `/login`; 6º intento fallido → bloqueo temporal |
| **US2** Tareas y rachas             | Crear tarea con categoría → completarla → el día de hoy cuenta en la racha; vencimiento no se desplaza de día |
| **US3** Pomodoro persistente        | Iniciar sesión; recargar/cerrar pestaña y reabrir < 24 h → tiempo restante real; si expiró cerrada → no se registra |
| **US4** Notas                       | Escribir y esperar ~1 s → recargar → contenido conservado; fijar → sube en la lista |
| **US5** Preferencias y dashboard    | Cambiar tema/zona → persiste; `/dashboard` muestra resumen del día              |
| **SC-006** Health                   | `curl http://localhost:3000/api/health` → `{"status":"ok"}` en < 2 s            |

## Despliegue (Vercel)

1. Importar el repo; definir `DATABASE_URL` (Production).
2. `postinstall` regenera Prisma.
3. Aplicar migraciones contra la base de producción (`npm run db:deploy`) y
   sembrar una vez (`npm run db:seed`).
4. Comprobar `/api/health` en la URL desplegada.

> **Nota**: existe un defecto abierto de login en producción (`POST /login` →
> 500). Ver `research.md` → "Riesgo abierto"; debe resolverse antes de dar por
> verificado SC-001/SC-002.
