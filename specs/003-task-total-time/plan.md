# Plan: tiempo total por tarea y actividad Pomodoro

**Feature**: `003-task-total-time` | **Spec**: [spec.md](./spec.md)

## Enfoque

Ampliar el temporizador local existente: conservar por fase su inicio, ID estable y segmentos activos (incluida su recuperación en `localStorage`); al completar o abandonar, enviar los segmentos transitorios. El servidor los valida, calcula `actualSeconds` sumando milisegundos y truncando una vez, y registra la fase y cualquier incremento de tarea en una transacción. Un abandono queda persistido con `completed = false` y `endedAt` efectivo; en una carrera prevalece el primer commit. El acumulado de tarea usa tiempo de pared, con tope de 28 800 segundos por fase; la estadística Pomodoro suma solo tiempo activo. Sin dependencia nueva, columna ni migración.

El trabajo será test-first con Vitest y datos simulados, mantendrá autorización por usuario, `revalidatePath` y render dinámico conforme a AGENTS.md y la constitución. Las funciones puras reciben timestamps/“hoy” explícitos; las fechas de día usan la zona del usuario. No se cambian APIs de Next.js, así que no se prevé modificar middleware ni consultar nuevas APIs de Next.

## Archivos previstos y cobertura

| Archivos | Cambio | Requisitos |
| --- | --- | --- |
| `src/lib/pomodoro.ts` | Identidad/estado serializado de fase, cálculo de segmentos y helpers puros de métrica, fallback y límite. “Ahora” y fechas entran como argumentos. | FR-026–029, FR-038, FR-041 |
| `src/app/actions/pomodoro.ts`, `tests/unit/pomodoro-action.test.ts` | Primero fijar y probar el contrato de registro: validar payload, timestamps, tarea y estado de finalización; persistir abandono con `completed = false` y `endedAt` efectivo; insertar usando ID estable y actualizar atómicamente la tarea propia. En ID duplicado, comparar los seis valores normalizados: aceptar retry idéntico y rechazar conflicto sin repetir incremento. En carreras completar/abandonar gana el primer commit. | FR-026, FR-030–036, FR-038–039, FR-041 |
| `src/app/(app)/pomodoro/pomodoro-client.tsx`, `src/lib/pomodoro-completion.ts`, `tests/unit/pomodoro-completion.test.ts` | Después integrar el contrato: crear y persistir ID al iniciar fase; cerrar/guardar segmentos en pausa, reanudación, completar y abandonar; pasar la tarea del WORK también a descansos; al abandonar enviar fin efectivo y detener el ciclo tras registrar la fase. | FR-026–027, FR-030–033, FR-038, FR-041 |
| `tests/unit/pomodoro.test.ts` | Cubrir cálculo/validación pura, estado serializado, historial, métricas, límite y fechas locales. | FR-026–029, FR-038, FR-041 |
| `src/app/(app)/pomodoro/page.tsx`, `src/app/(app)/dashboard/page.tsx` | Consultar completadas y abandonadas para duración activa; aplicar fallback legacy solo a WORK completado con cero; contar objetivos/focos solo por WORK completado y día local de inicio. | FR-028–029 |
| `src/app/(app)/tasks/tasks-client.tsx`, `src/app/(app)/dashboard/page.tsx` | Aviso visible sobre la limitación histórica sin alterar los acumulados existentes; conservar formato compartido. | FR-034, FR-037, FR-040 |
| `tests/unit/tasks-client.test.ts` | Comprobar explicación histórica y presentación de acumulados. Todos los tests usan dobles; sin red ni base real. | FR-034, FR-037, FR-040 |
| `docs/architecture.md`, `MEMORY.md` | Documentar semántica de tiempo de tarea/activo, abandonos (`completed=false`, fin efectivo y primera transacción ganadora), asociación de descansos, idempotencia y límites/histórico; actualizar resumen y estado tras convergencia. | FR-026–FR-041 |

No se prevén cambios a `prisma/schema.prisma`, migraciones, `AGENTS.md` ni `docs/constitution.md`: el esquema existente ya tiene ID, tarea opcional, `actualSeconds`, `completed`, timestamps y `Task.accumulatedSeconds`; las reglas generales de agentes/constitución ya cubren SDD, tests, autorización y fechas. Si el código revela que esto no se cumple, detener la implementación y reportar la incompatibilidad, sin ampliar el alcance de persistencia unilateralmente.

## Decisiones, alternativas y límites

| Decisión | Alternativa descartada | Motivo / límite conocido |
| --- | --- | --- |
| Un ID de fase creado en browser (UUID), guardado con el estado local y usado como `PomodoroSession.id`; la primera transacción confirmada prevalece. | ID generado únicamente por Prisma o sobrescribir la fila al reintentar. | Permite deduplicar solicitudes concurrentes sin columna nueva; el servidor compara `phase`, `taskId`, `actualSeconds`, `startedAt`, `endedAt`, `completed`. Una diferencia es conflicto, nunca una segunda imputación. |
| Segmentar tiempo activo con pares de epoch-ms en payload; validar límites, orden, solapamiento y coherencia; no guardar segmentos. | Enviar solo segundos declarados o persistir cada segmento. | Los segundos se calculan en servidor sumando ms y truncando una sola vez. El reloj del navegador no es auténtico ni verificable; solo se comprueba consistencia estructural. |
| Imputar a tarea la duración de pared por fase, pausas incluidas, hasta 8 h; heredarla a descansos mientras siga vigente el ciclo. | Contar solo WORK activo/completado o excluir pausas y descansos. | Respeta la semántica aprobada. Una fase expirada con pestaña cerrada sigue descartándose según spec 002. |
| Asociar el registro de fase y el incremento de tarea dentro de la transacción; ante ID ya usado, comprobar el registro persistido y resolver retry/conflicto sin incrementar otra vez. | Incrementar primero fuera de la transacción o confiar en un guard del cliente. | Evita imputación parcial y duplicada. El reloj/payload manipulado por el cliente sigue siendo un riesgo aceptado por spec. |
| Conservar acumulados anteriores sin backfill; mostrar aviso de histórico incompleto. | Recalcular desde filas antiguas o borrar/ajustar acumulados. | Las filas previas no contienen pausas/segmentos suficientes para reconstruir tiempo de pared. Para estadística legacy, fallback `plannedSeconds` solo en WORK completado con `actualSeconds = 0`. |

Casos límite a cubrir: abandono corriendo o pausado (fin efectivo en el instante de abandono y `completed=false`, también con cero activo); tarea ausente/ajena/eliminada (guardar fase, sin vínculo ni incremento); pausa larga (tope por fase); segmento fuera del intervalo, invertido, solapado o aritméticamente inconsistente (rechazar); retry con segmentos distintos pero mismos valores finales (idempotente) versus cualquier valor final distinto (conflicto); carrera completar/abandonar (gana el primer commit); cruce de medianoche/timezone; break sin WORK con tarea vigente (sin imputación); expiración local descartada; históricos de break/abandono a cero (cero) y WORK completado histórico (fallback planificado). No se afirma protección contra manipulación del reloj local.

## Pruebas y gates

Escribir primero tests puros; después probar el contrato de servidor con dobles antes de integrar su consumidor cliente. Cubrir segmentos en ms y truncado único, estado serializado, pausas/reanudaciones, herencia y abandono; validar que solo el abandono persiste `completed=false` con `endedAt` efectivo, que una fase en curso no se persiste y que las carreras completar/abandonar conservan el primer commit. Probar autorización, límite, atomicidad, retry/conflicto, estadísticas, fallback, día local y presentación. Cada tarea de `tasks.md` termina con `npm run test` en verde antes de continuar. Al final ejecutar, en este orden, `npm run test`, `npm run lint`, `npm run typecheck` y `npm run build`; revisar diff y cobertura de FR-026–FR-041. Tests sin red/BD real. No ejecutar despliegues ni comandos Neon/Prisma de migración porque no hay cambio de esquema.

## Documentación de convergencia

Actualizar `docs/architecture.md` con la semántica efectiva de sesión/tarea y métricas, incluida la persistencia del abandono y la regla de primera transacción; actualizar `MEMORY.md` con el resumen implementado, tests/gates y limitación histórica. La convergencia exige evidencia para FR-026–FR-041. No modificar `AGENTS.md` ni la constitución: no cambia el flujo ni las reglas comunes del repositorio.
