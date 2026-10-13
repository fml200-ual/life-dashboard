# Implementation Plan: Pomodoro con auto-avance y tiempo por tarea

**Branch**: `002-pomodoro-autostart-task-time` | **Date**: 2026-10-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-pomodoro-autostart-task-time/spec.md`.

## Summary

Extender el temporizador existente basado en `endAt` y `localStorage`, sin sustituir su flujo de pausa/reanudación ni introducir servicios de estado en servidor. Añadir la preferencia de auto-avance (desactivada para preferencias nuevas y existentes), mantener la tarea elegida durante una cadena, registrar segundos efectivos en las sesiones WORK y acumularlos en la tarea. Las notificaciones del navegador son best-effort: solo se muestran con permiso concedido y una página abierta; la falta de permiso o disponibilidad no detiene el ciclo. La lista de tareas y el dashboard leerán el mismo acumulado persistido.

El arreglo de actualización inmediata al crear tareas está fuera de esta spec; se mantiene en una tarea independiente de bug-fixing porque fue pedido aparte.

## Contexto técnico

- Next.js 16 App Router, React 19 y TypeScript; las mutaciones pasan por Server Actions.
- Prisma 7 sobre PostgreSQL/Neon con adapter `pg`; en Vercel el runtime sigue requiriendo solo `DATABASE_URL`.
- Temporizador cliente actual: `endAt` epoch persistido en `localStorage`, recuperación hasta 24 horas, completado por `completePomodoroAction`.
- Pruebas con Vitest mediante `npm run test`; tests de dominio sin red ni base de datos real.
- Todas las consultas y escrituras personales siguen filtradas por el usuario autenticado. Las páginas con datos personales permanecen dinámicas y las acciones revalidan rutas afectadas.
- Las claves de día siguen la convención del proyecto `YYYY-MM-DD` local, calculadas con la zona horaria del usuario; no se inferirá “hoy” desde UTC ni desde el reloj global dentro de funciones puras.

## Diseño y compatibilidad

### Persistencia y migración

- `prisma/schema.prisma`: añadir `UserPreferences.autoAdvance Boolean @default(false)`, `Task.accumulatedSeconds Int @default(0)` y `PomodoroSession.actualSeconds Int @default(0)`. Los campos nuevos son aditivos y tienen default; filas existentes quedan con auto-avance apagado y acumulados cero.
- Mantener `PomodoroSession.taskId` nullable y la relación actual `onDelete: SetNull`. Una sesión de descanso siempre se persiste con `taskId: null`; una eliminación concurrente de la tarea no debe impedir guardar el período terminado y su relación queda nula.
- La migración aditiva preparada es `prisma/migrations/20261013120000_pomodoro_autostart_task_time/migration.sql`. El usuario autorizó expresamente aplicarla directamente en producción al no haber una base aislada disponible; la autorización cubre esta migración, no otras operaciones ni cambios destructivos. T002 permanece pendiente hasta que se complete y documente la aplicación y validación.
- Procedimiento autorizado para T002, sin revelar credenciales ni imprimir `DATABASE_URL`: (1) confirmar mediante configuración/metadatos seguros que el destino efectivo es Neon, proyecto `hidden-mode-50556987`, branch `production` (`br-dark-snow-ba2hi3vl`) y base `neondb`; si no coincide o no puede confirmarse, detenerse. (2) Revisar el SQL exacto de la migración frente al esquema: únicamente las tres columnas aditivas `Task.accumulatedSeconds INTEGER NOT NULL DEFAULT 0`, `PomodoroSession.actualSeconds INTEGER NOT NULL DEFAULT 0` y `UserPreferences.autoAdvance BOOLEAN NOT NULL DEFAULT false`; sin backfill ni operaciones destructivas. Consultar el estado de migraciones y continuar solo si esta es la única migración pendiente esperada; ante cualquier diferencia, detenerse y reportarla. (3) Aplicar exclusivamente mediante el comando del proyecto `npm run db:deploy` (script `prisma migrate deploy`); no editar ni ejecutar SQL manualmente. (4) Volver a comprobar el estado de Prisma y, con consultas de solo lectura, la existencia, nulabilidad y defaults de las tres columnas en la misma base/branch. Confirmar que la migración consta como aplicada y que filas existentes reciben los defaults esperados. Si alguna comprobación falla o el destino cambia, detenerse sin intentar revertir ni ejecutar una operación destructiva. (5) Documentar destino confirmado sin secretos, migración aplicada, estado, comprobaciones y resultado; mantener T002 pendiente mientras falte cualquiera de esas evidencias. La actualización de plan/tareas debe aprobarse antes de continuar según SDD; no se requiere una segunda autorización para esta misma migración ya autorizada.
- No recalcular retrospectivamente tiempos desde sesiones antiguas: los datos históricos no expresan pausas y por ello no prueban tiempo real transcurrido. Los acumulados comienzan en cero y crecen con concentraciones completadas tras el cambio.

### Lógica del dominio y temporizador

- Añadir utilidades puras en `src/lib/pomodoro.ts` (o módulo equivalente): selección del siguiente modo, cómputo de focos WORK completados en una clave local `today` explícita, y cálculo de segundos activos a partir de duraciones/timestamps explícitos. Ninguna función de dominio debe leer `Date.now()` ni derivar “hoy” implícitamente.
- El intervalo del descanso largo se evalúa con el número de sesiones WORK completadas del día local del usuario, no con descansos completados. El llamador obtiene `today` usando `todayKey(user.timezone)` y las sesiones `startedAt` se agrupan con `toDateKey`.
- Extender el estado serializado del temporizador con `taskId`, segundos activos ya acumulados y el inicio del tramo actualmente en ejecución. Al pausar, sumar solo el tramo que estaba corriendo; al reanudar, iniciar un tramo nuevo. La recuperación de una pestaña mantiene la tarea asignada y los segundos acumulados. Una sesión vencida al reabrir sigue descartándose y no inicia la siguiente fase.
- `start` manual fija o limpia la tarea para esa sesión WORK. El selector solo presenta tareas pendientes y queda bloqueado mientras la sesión está corriendo o pausada. El auto-WORK tras un descanso hereda la misma asignación; un nuevo inicio manual empieza sin heredarla.
- Al completar cualquier fase, mostrar aviso best-effort antes de resolver el paso siguiente. Con auto-avance desactivado se mantiene el comportamiento actual (fase terminada, temporizador detenido). Activado: WORK → descanso según intervalo; descanso → WORK; el ciclo solo se detiene por pausa o abandono. Abandonar anula la fase activa y no registra ni encadena esa fase. Las notificaciones no usarán push, service worker ni estado global adicional.

### Registro, validación y seguridad

- Extender `completePomodoroAction` con los segundos reales transcurridos. Validar tipo, entero y límites coherentes con `plannedSeconds`; no aceptar `taskId` para fases de descanso, ni enlazar tareas de otro usuario. Persistir `actualSeconds` por fase y aumentar `Task.accumulatedSeconds` únicamente para sesiones WORK completadas con tarea válida, dentro de una misma transacción de Prisma para evitar discrepancias parciales.
- Mantener validación de pertenencia a `userId` en servidor, incluso si el cliente solo envía IDs de su lista. Si la tarea desapareció durante la sesión, registrar el foco sin relación ni incremento de una tarea inexistente; no revelar datos de terceros ni asociar IDs ajenos.
- Las concentraciones sin tarea y todos los descansos se registran normalmente, con `actualSeconds` informativo, pero no modifican acumulados. No cambiar el estado de la tarea al completar.
- Añadir `autoAdvance` a `pomodoroSettingsSchema`, acción y formulario. La ausencia del checkbox representa `false`; leer preferencias inexistentes con fallback `false` mantiene compatibilidad.

### Presentación

- `/tasks` muestra `accumulatedSeconds` para cada tarea de forma entendible y coherente, incluso si vale cero (cero explícito, sin sugerir tiempo invertido). `/dashboard` muestra el mismo dato en las tareas resumidas y limita su selección a tareas existentes que el dashboard ya presenta.
- Extraer o cubrir con tests una función pura de formato para presentar segundos; los mismos segundos deben producir la misma etiqueta en ambas rutas.

## Mapa de cambios y requisitos cubiertos

| Área / archivos previstos | Diseño y responsabilidad | RF |
| --- | --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/<nueva>/` | Campos aditivos/defaults para preferencia, acumulado y segundos efectivos; conservar relaciones y defaults previos. | FR-020, FR-022, FR-024 |
| `src/lib/pomodoro.ts`, `tests/unit/pomodoro.test.ts` | Funciones puras para siguiente fase, selección del descanso largo según WORK de `today`, límites y segundos activos; reloj/fecha inyectados como argumentos. | FR-016–FR-018, FR-020, FR-022 |
| `src/lib/validations.ts`, `src/app/actions/settings.ts`, `src/app/(app)/settings/page.tsx`, `settings-client.tsx` | Validación, persistencia y control de la preferencia con default apagado. | FR-015, FR-024 |
| `src/app/actions/pomodoro.ts` y tests de acciones/validación | Aceptar únicamente fases/tarea/duración válidas; persistir sesión y actualizar acumulado atómicamente con autorización. | FR-021, FR-022, FR-025 |
| `src/app/(app)/pomodoro/page.tsx`, `pomodoro-client.tsx` | Proveer preferencias, conteo local de WORK y tareas pendientes; selector fijado, estado local recuperable, cadena continua y aviso al final de toda fase. | FR-016–FR-021 |
| `src/app/(app)/tasks/page.tsx`, `tasks-client.tsx`; `src/app/(app)/dashboard/page.tsx` | Leer y representar los segundos acumulados de las tareas; compartir formato sin divergencia. | FR-023 |
| `src/app/(app)/tasks/tasks-client.tsx` (solo tarea independiente) | Corregir actualización optimista/lista local tras crear tarea; no forma parte de la funcionalidad ni los criterios de convergencia de esta spec. | Fuera de FR-015–FR-025 |

## Decisiones y alternativas descartadas

| Decisión | Alternativa descartada | Motivo |
| --- | --- | --- |
| Mantener `endAt`/`localStorage` como autoridad de ejecución en cliente y ampliar el objeto guardado. | Temporizador en memoria de servidor, cron o almacenamiento compartido para cada tick. | Añade estado/infraestructura serverless innecesaria y rompe el patrón reanudable ya desplegado. |
| Persistir `actualSeconds` en sesión y `accumulatedSeconds` en tarea, actualizados en una transacción. | Derivar el total de duración planificada o de `startedAt`/`endedAt`. | La duración planificada incluye minutos pausados y el intervalo inicio-fin no distingue pausa; hace falta un acumulado verificable de tiempo activo. |
| Descanso largo usando focos WORK completados en el día local del usuario, con `today` suministrado explícitamente. | Contar todos los registros Pomodoro (incluidos descansos), usar día UTC o mantener contador solo en memoria. | Respeta el intervalo de sesiones de concentración, evita desfases de zona y sigue funcionando tras recarga/Vercel. |
| Acumular segundos solo al finalizar una concentración asignada, descontando segmentos pausados. | Imputar continuamente al empezar o incluir tiempo pausado/abandonado. | Evita imputaciones por sesiones incompletas y cumple el cómputo de tiempo real exigido. |
| Notificaciones nativas del navegador best-effort, sin dependencia nueva. | Push notification en segundo plano/Service Worker. | La petición permite que la pestaña siga abierta; push requiere permisos, infraestructura y complejidad no justificadas. |
| Formatear y leer un único valor entero de segundos persistido. | Guardar minutos flotantes o mantener un acumulado independiente en el cliente. | Evita redondeos y discrepancias entre dashboard y tareas. |

## Estrategia de tests y gates

1. Test-first con Vitest: escribir primero pruebas para transición WORK/descanso, descanso largo en el límite del intervalo y cambio de `today`, ciclos de varios focos, pausa/reanudación sumando solo tiempo en ejecución, expiración y asignación conservada al reanudar.
2. Probar validaciones/acciones con dobles: preferencias por defecto y checkbox ausente, `actualSeconds` inválido/excesivo, fase break con `taskId`, tarea propia/ajena/eliminada, y actualización atómica solo para WORK asignado; asegurar que el estado de Task no cambia.
3. Probar formato y consistencia de segundos en `/tasks` y dashboard; verificar tarea sin tiempo y tarea con acumulado. Para UI/flujo de navegador, incluir pruebas de componente donde el harness existente lo permita y una verificación manual autenticada de permisos de notificación, pausa, reanudación y varios ciclos.
4. Ejecutar `npm run test`, `npm run lint` y `npm run typecheck`; además `npm run build` para validar generación/imports del cliente Prisma. No depender de red ni base real en Vitest.
5. La aplicación y validación de producción descritas en «Persistencia y migración» pertenecen a T002, no a esta gate final. T009 consume la evidencia documentada allí y no vuelve a aplicar ni duplica las comprobaciones de la migración. No ejecutar comandos de base de datos como parte de T009.

## Riesgos y mitigaciones

- Cambios de reloj/pausas pueden sobrerrepresentar segundos: usar timestamps inyectados y tests con reloj controlado, y nunca fiarse de los ticks de render.
- Peticiones repetidas al completar deben evitarse con el guard existente de finalización en cliente; despejar el estado persistido una vez finalizada la solicitud y comprobar fallos de guardado sin encadenar una sesión que no se registró.
- Cambiar de día durante un ciclo puede alterar el contador de descanso largo: definir el cálculo por día local de inicio/completado conforme a las sesiones `startedAt`, y probar el límite de medianoche.
- Fallo de notificación o permiso denegado no debe bloquear guardado ni transición del temporizador.
- Diferencia entre preferencias aún no creadas y defaults de Prisma se cubre tanto al leer (`false`) como en migración (`@default(false)`).

## Convergencia

La entrega se considera convergida cuando los FR-015–FR-025 se verifican contra la spec; todas las gates pasan; T002 contiene evidencia satisfactoria de la migración aditiva autorizada aplicada y validada en el destino de producción confirmado; los datos personales siguen protegidos y no cacheados; el ciclo no requiere estado en memoria compartido y la aplicación mantiene compatibilidad con Vercel. El bug de creación inmediata es independiente y no bloquea esta convergencia.
