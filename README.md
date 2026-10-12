# Life Dashboard

Panel personal de productividad: tareas con rachas por categoría, temporizador
Pomodoro persistente, notas con autoguardado y ajustes. Aplicación de **cuenta
única** (registro cerrado), construida sobre Next.js y PostgreSQL.

## Tecnologías

- **Next.js 16** (App Router, `src/`), TypeScript, Tailwind CSS v4
- **PostgreSQL** gestionado en **Neon** con **Prisma 7** (driver adapter `pg`)
- Sesiones propias con cookie httpOnly (`ld_session`), contraseñas con `bcryptjs`
  (no se usa Auth.js)

## Requisitos

- Node.js 20+
- Una base PostgreSQL (p. ej. Neon). No hace falta motor local.

## Puesta en marcha

```bash
npm install

# 1) Conexión y credenciales
cp .env.example .env

# 2) Rellena en .env:
#    DATABASE_URL (PostgreSQL con sslmode=require)
#    ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME / ADMIN_TIMEZONE

# 3) Primera migración y cuenta autorizada
npm run db:migrate
npm run db:seed

# 4) Entorno local
npm run dev
```

Abre `http://localhost:3000`. El único usuario (el del seed) inicia sesión en
`/login`; no existe registro público.

## Scripts

| Comando              | Descripción                                  |
| -------------------- | -------------------------------------------- |
| `npm run dev`        | Servidor de desarrollo                       |
| `npm run build`      | Compilación de producción                    |
| `npm start`          | Servidor de producción                       |
| `npm run lint`       | ESLint                                       |
| `npm run typecheck`  | `tsc --noEmit`                               |
| `npm run db:generate`| Regenera el cliente Prisma                   |
| `npm run db:migrate` | Crea/aplica migraciones en desarrollo        |
| `npm run db:deploy`  | Aplica migraciones (CI/CD)                   |
| `npm run db:seed`    | Seed de la cuenta única y categorías         |
| `npm run db:studio`  | Prisma Studio                                |

## Estructura

```
src/
  app/
    (auth)/login/      Página de acceso
    (app)/             Sección autenticada: dashboard, tasks, pomodoro, notes, settings
    actions/           Server Actions (auth, tasks, pomodoro, notes, settings)
    api/health/        Health check de la base de datos
  components/          Shell de la app + UI base
  lib/                 Autenticación, Prisma, fechas/rachas, validación, tema
  proxy.ts             Protección optimista de rutas (antiguo middleware)
prisma/schema.prisma   Esquema de datos
```

## Despliegue (Vercel)

1. Importa el repositorio y define las variables de entorno (ver `.env.example`).
2. El `postinstall` regenera el cliente Prisma automáticamente.
3. Aplica la migración con `npm run db:deploy` y siembra una vez con
   `npm run db:seed` (desde tu equipo contra la misma base).

## Decisiones clave

- **Fechas de día** (`YYYY-MM-DD`) como cadenas en zona local para rachas y
  vencimientos, evitando el desfase al convertir a UTC.
- El temporizador Pomodoro guarda el instante previsto de fin (`endAt`), no un
  contador: si cierras la pestaña y vuelves antes de 24 h se reanuda; si expira
  sin terminar, la sesión se anula y no se cuenta.
- El `proxy.ts` redirige por cookie de forma optimista; la autorización real se
  valida siempre en el servidor (layout y acciones). Esto permite desplegar
  **Vercel** (función Edge/proxy) centrándose en la sesión de base de datos.
- Limpieza de sesiones vencidas prevista como tarea de mantenimiento semanal.
- Integraciones (p. ej. Gmail) se añadirán en una fase posterior vía
  `IntegrationConfig` con tokens cifrados en el servidor.