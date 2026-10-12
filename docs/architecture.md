# Arquitectura

Documento de referencia de la implementación y las decisiones técnicas.

## Visión general

Aplicación personal de productividad con **una sola cuenta** (registro cerrado).
El frontend es Next.js 16 App Router; los datos viven en PostgreSQL (Neon) y se
acceden con Prisma 7 mediante driver adapter `pg` (apto para funciones
serverless de Vercel). No se usan librerías de auth de terceros: la sesión es
propia y opaca.

## Autenticación

- **Modelo**: cookie `ld_session` con token opaco (`randomBytes(32)`,
  base64url). Solo se guarda en base su hash SHA-256 (tabla `Session`).
- TTL de 30 días (`SESSION_TTL_DAYS`); `sameSite: lax`, `httpOnly`,
  `secure` en producción.
- Contraseñas con `bcryptjs` (12 rondas); el seed crea el único usuario.
- El `proxy.ts` (sucesor del `middleware` en Next.js 16) redirige por la
  presencia de cookie. Es una **optimización de red**: la comprobación real se
  hace siempre en servidor (`requireUser()` en layouts y acciones).
- Rate limit en memoria (`src/lib/rate-limit.ts`) para el login (5 intentos /
  15 min por IP+email). **Advertencia**: en despliegue serverless cada instancia
  tiene su propia memoria; para bloqueos globales migrar a un almacén
  compartido (p. ej. Upstash) manteniendo la misma interfaz.

## Datos (Prisma)

- El cliente se genera en `src/generated/prisma` (gitignored) y se regenera en
  `postinstall`. Se importa siempre desde `client.ts`.
- El datasource lee `DATABASE_URL` del entorno vía `prisma7.config.ts`.
- Claves de datos importantes:
  - `User.timezone` es la zona horaria del usuario (se usa para fechas "de día").
  - `UserPreferences` guarda tema, duración Pomodoro, objetivo diario y
    notificaciones.
  - `StreakDay` es un día de actividad por `(userId, categoryId)` con `date`
    como `YYYY-MM-DD` local; se incrementa al completar tareas de la categoría.
  - `PomodoroSession` registra fase, segundos planificados, inicio y fin.
  - `IntegrationConfig` está lista para conectores OAuth (Gmail en fase
    posterior); los tokens irán cifrados y nunca al cliente.

## Fechas y rachas

- Las fechas de calendario se tratan como **cadenas locales** `YYYY-MM-DD`
  mediante `Intl.DateTimeFormat("en-CA", { timeZone })` (`src/lib/date.ts`),
  evitando que al convertir a UTC se desplaze el día en servidores con otra zona.
- Para vencimientos de tareas (`dueDate` en la BD como *Date*), se guarda la
  medianoche en UTC de la clave local y se lee con partes UTC, conservando el
  mismo día.
- `computeStreak()` calcula racha actual (solo si el último día es hoy o ayer)
  y la más larga.

## Pomodoro (basado en timestamps)

- El temporizador no guarda segundos en el cliente: al iniciar se fija `endAt`
  (epoch ms) y se persiste en `localStorage` junto a fase y duración.
- Puede cerrarse la pestaña y retomarse antes de 24 h (se reanuda con el tiempo
  restante real); si al volver ya expiró o pasaron más de 24 h, la sesión se
  descarta y no se registra.
- Al completar una sesión, el cliente envía `plannedSeconds` y `endedAt` a una
  Server Action que crea el registro (el backend recalcula `startedAt`).
- Las estadísticas (hoy / total) se calculan desde `PomodoroSession`.
- Recordatorio de descanso largo cada `longBreakInterval` sesiones completadas.

## Notas

- Autoguardado con *debounce* en cliente (800 ms) hacia `updateNoteAction`.
- Fijado (pin) reordena la lista (servidor ordena por `pinned desc,
  updatedAt desc`).

## Operaciones de datos en la app

- Cada acción verifica la propiedad (todas las queries de escritura filtran por
  `userId`).
- Tras mutar se llama a `revalidatePath` para refrescar el server data.
- El dashboard y el módulo de tareas responden de forma **dinámica** por sesión;
  `cacheComponents` está desactivado (Next 16) para no cachear componentes con
  datos personales.

## Rutas

| Ruta          | Acceso   | Descripción                                  |
| ------------- | -------- | -------------------------------------------- |
| `/`           | pública  | Redirige a `/login` o `/dashboard`           |
| `/login`      | pública  | Inicio de sesión                             |
| `/dashboard`  | privada  | Resumen del día, rachas y próximas tareas    |
| `/tasks`      | privada  | CRUD de tareas, categorías y estados         |
| `/pomodoro`   | privada  | Temporizador y estadísticas                  |
| `/notes`      | privada  | Notas con autoguardado                       |
| `/settings`   | privada  | Preferencias (tema, zona horaria, Pomodoro)  |
| `/api/health` | pública  | Health check (conecta a la BD)               |

## Seguridad

- Ningún secreto se versiona: `.env*` está ignorado; no hay plantilla con credenciales en el repo.
- Las acciones de servidor rechazan operaciones que no pertenezcan al usuario.
- El token de sesión solo viaja en cookie httpOnly; el `tokenHash` en BD impide
  su reutilización desde las cabeceras.
- Pendiente (fase posterior): rotación automática de sesiones y limpieza
  periódica de registros vencidos.

## Mejoras pendientes

- Despliegue de ejemplo en Vercel + variables de entorno reales.
- Integración Gmail/OAuth (Google) y cifrado de tokens.
- Etiquetas (tabla `Tag` ya en el esquema) para tareas y notas.
- Tests (Vitest) de `date.ts`, `auth.ts` y acciones.
- Limpieza programada de sesiones expiradas.