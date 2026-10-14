# Feature Specification: Tiempo total por tarea y actividad Pomodoro

**Feature Branch**: `003-task-total-time`

**Created**: 2026-10-14

**Estado**: borrador

**Input**: «Quiero añadir esta funcionalidad: Vamos a diseñar una feature para que las tareas sumen el tiempo total tanto de la sesion work, descanso y cuando se quedan a medias, (es decir que cuenten todos los minutos pares la tarea o no)».

## Propósito y enmienda a la spec 002

La tarea debe reflejar todo el tiempo de pared de las fases que se le asocian, incluidas las pausas y los descansos del ciclo. Por separado, las estadísticas Pomodoro deben reflejar únicamente el tiempo durante el que el temporizador estuvo corriendo. El navegador aporta los timestamps y segmentos activos, mantiene estos segmentos en el estado local y los envía al registrar la fase. El servidor valida su consistencia estructural y aritmética, y aplica el límite de 8 horas imputables por fase; no verifica la autenticidad del reloj del navegador.

Esta spec reemplaza el **FR-022** y el **SC-010** de `002-pomodoro-autostart-task-time` en lo afectado: ya no se limita la imputación a focos WORK completados ni se excluyen todos los descansos. Los descansos de un ciclo con tarea se imputan a esa tarea; los abandonos también se registran. El resto de garantías de la spec 002 se mantiene, incluido que la tarea se asigna al iniciar WORK, no se completa automáticamente y los datos se aíslan por usuario. El abandono deja de significar «no registrar la fase»; sí detiene el ciclo según el comportamiento existente.

La cantidad de focos completados y sus objetivos continúan basándose en sesiones WORK completadas, atribuidas al día local en que empezó el WORK según la zona horaria del usuario. La estadística de **duración activa** es distinta: suma `actualSeconds` de cualquier fase, completada o abandonada, con o sin tarea.

## User Story - Tiempo de tarea y duración activa

El usuario asigna una tarea a un foco WORK. El tiempo acumulado de esa tarea aumenta con el tiempo de pared de ese foco y de los descansos de su ciclo, incluidas las pausas. Si abandona una fase, también se guarda el tiempo correspondiente. El usuario puede distinguir este acumulado de tarea de la estadística Pomodoro, que suma el tiempo activo del temporizador y excluye pausas.

**Why this priority**: permite conocer el tiempo total transcurrido asociado al trabajo de una tarea sin alterar la medición de actividad efectiva del temporizador.

**Independent Test**: iniciar WORK con una tarea, pausar y reanudar, completar un descanso asociado y abandonar una fase; comprobar que el acumulado de tarea incluye los intervalos de pared de las fases asociadas y que la estadística suma solo los tramos activos de todas las fases guardadas.

### Acceptance Scenarios

1. **Given** un WORK con tarea, **When** termina, **Then** el acumulado de la tarea aumenta por el tiempo de pared entre el inicio real y el fin de la fase, incluidas las pausas.
2. **Given** un WORK con tarea y su ciclo aún activo, **When** empieza un descanso automático o manual, **Then** el descanso hereda la tarea del WORK más reciente y su tiempo de pared se imputa a ella.
3. **Given** un descanso sin un WORK con tarea en el ciclo vigente, **When** termina o se abandona, **Then** no imputa tiempo a ninguna tarea.
4. **Given** una fase asociada a una tarea, **When** el usuario la abandona, incluso estando en pausa, **Then** se registra con fin efectivo en el instante del abandono y se imputa a la tarea el tiempo de pared desde el inicio hasta ese instante, incluidas las pausas.
5. **Given** una fase sin tarea, **When** se completa o se abandona, **Then** se registra la fase y su tiempo activo cuenta en la estadística Pomodoro, pero ninguna tarea aumenta.
6. **Given** dos envíos concurrentes para la misma fase, **When** una transacción confirma primero en la base de datos, **Then** solo existe un registro y un incremento, y el resultado alternativo no lo reemplaza. Un reintento con el mismo ID es idempotente si coinciden los datos finales persistidos (`phase`, `taskId`, `actualSeconds`, `startedAt`, `endedAt` y `completed`), aunque cambien los segmentos y produzcan esos mismos valores; si difiere algún dato final, se rechaza como conflicto.
7. **Given** una fase que cruza medianoche local, **When** se actualiza el conteo diario, **Then** un WORK completado se atribuye al día local de su inicio según la zona horaria del usuario.
8. **Given** una tarea con acumulado previo a esta mejora, **When** se muestra en tareas o dashboard, **Then** se conserva el valor y se explica visiblemente que el histórico no incluye descansos ni pausas.
9. **Given** una fase cuya duración de pared supera ocho horas, **When** se imputa a una tarea, **Then** el incremento no supera 28 800 segundos para esa fase.
10. **Given** una fase en curso, **When** aún no se ha completado ni abandonado, **Then** no existe un registro persistido; al abandonarla, se guarda con `completed = false` y `endedAt` igual al instante de abandono.

## Semántica y casos límite

- **Fuente temporal**: timestamps y segmentos activos provienen del reloj del navegador. Los segmentos se mantienen solo en el estado local mientras la fase está en curso y se envían en la petición de completar/abandonar; no se persisten en la base de datos. El servidor valida solo consistencia estructural y aritmética: timestamps en orden, segmentos en orden cronológico, dentro de los límites de la fase y no solapados, y suma coherente con la duración activa. No verifica el reloj real ni que los datos sean auténticos.
- **Tiempo activo (`actualSeconds`)**: el servidor suma la duración de los segmentos activos en milisegundos y trunca el total una sola vez a segundos enteros. Las pausas no cuentan. El agregado se conserva para estadísticas, tanto en fases completadas como abandonadas; no se guardan los segmentos individuales.
- **Tiempo de tarea**: segundos completos transcurridos entre el inicio real y el fin efectivo de la fase. Incluye las pausas. En una fase abandonada, el fin efectivo es el instante de la acción de abandono, aunque la fase lleve pausada; no se usa como fin el último instante activo.
- **Límite**: el incremento de una tarea por una fase se limita a 28 800 segundos (8 horas). No se imputan más de ocho horas por fase.
- **Tareas y descansos**: los descansos automáticos y manuales heredan la tarea del WORK con tarea más reciente mientras no empiece otro WORK ni se abandone el ciclo. Tras iniciar otro WORK, el ciclo toma la tarea elegida para ese WORK; tras abandonar el ciclo no se hereda la tarea previa. No se permite elegir una tarea directamente para un descanso.
- **Abandonos**: se registra toda fase abandonada, con o sin tarea, para conservar su duración activa en estadísticas. Sin tarea, no hay incremento de `Task.accumulatedSeconds`. Si hay tarea válida, la imputación usa el tiempo de pared limitado por el máximo indicado.
- **Fase expirada con la pestaña cerrada**: se conserva la regla de la spec 002: si la fase expira antes de que el usuario vuelva, se descarta y no se registra como completada ni abandonada.
- **Datos históricos**: los acumulados de tareas previos se conservan sin recalcular. Desde la activación, los nuevos incrementos usan tiempo de pared; el usuario recibe una explicación visible de que el histórico previo no incluye descansos ni pausas. Para estadísticas, si `actualSeconds = 0`, solo las sesiones WORK con `completed = true` usan `plannedSeconds` como fallback histórico. Los descansos históricos con `actualSeconds = 0` aportan cero; las nuevas fases abandonadas con cero activo también aportan cero.
- **Tarea eliminada, inexistente o ajena**: la fase se conserva para las estadísticas, pero no se vincula ni imputa a una tarea que no pertenezca al usuario.
- **Consistencia e idempotencia**: el navegador genera un ID estable al iniciar cada fase, lo conserva con el estado local y lo envía al completar, abandonar y reintentar. Ese ID es el ID existente de la sesión en la base de datos; no se añade otro campo. La primera transacción confirmada en la base de datos gana. Con el mismo ID, se acepta como reintento idempotente si coinciden los datos finales persistidos `phase`, `taskId`, `actualSeconds`, `startedAt`, `endedAt` y `completed`; la lista de segmentos puede diferir si produce esos mismos datos. Si difiere cualquiera de esos valores, se rechaza como conflicto y no se modifica el registro previo ni se vuelve a incrementar la tarea. Si la tarea se eliminó antes de imputar, la fase se registra sin tarea ni incremento. Una fase en curso no se persiste; una fase abandonada sí, con `completed = false` y `endedAt` efectivo. Una fase no completa ni cambia automáticamente el estado de la tarea.

## Requirements

### Functional Requirements

- **FR-026**: Al completarse o abandonarse una fase Pomodoro, el sistema MUST registrar su fase, `actualSeconds`, timestamps de inicio y fin efectivo, estado de finalización y el ID estable generado para esa fase, aunque no tenga tarea asociada. Los segmentos activos MUST viajar en el payload desde el estado local del navegador y MUST NOT persistirse en la base de datos. El servidor MUST validar el orden de timestamps y segmentos, que cada segmento esté dentro del intervalo de la fase y que no haya solapamientos; MUST comprobar la coherencia aritmética de la suma activa y limitar a 28 800 segundos el tiempo imputable a tarea. La fuente de reloj es el navegador y el sistema MUST NOT afirmar que verifica su autenticidad.
- **FR-027**: El sistema MUST sumar en milisegundos las duraciones de segmentos activos y truncar una sola vez la suma a segundos enteros para obtener `actualSeconds`; MUST excluir pausas y usar este agregado para la estadística de duración activa de Pomodoro. Toda fase nueva completada MUST tener al menos un segundo activo; una fase abandonada puede tener cero.
- **FR-028**: La estadística de duración activa de `/pomodoro` MUST sumar `actualSeconds` de sesiones WORK, descansos cortos y descansos largos, completadas y abandonadas, con o sin tarea. MUST NOT incluir tiempo en pausa. Para filas históricas con cero, solo un WORK con `completed = true` MUST usar `plannedSeconds` como fallback; un descanso histórico o una fase abandonada con cero MUST aportar cero.
- **FR-029**: Los contadores de focos completados y objetivos diarios MUST seguir contando únicamente sesiones WORK completadas; una fase abandonada o un descanso MUST NOT incrementar esos contadores. El día de conteo MUST ser el día local de inicio del WORK, determinado con la zona horaria del usuario.
- **FR-030**: Cuando una fase completada o abandonada tenga una tarea válida asociada, el sistema MUST incrementar `Task.accumulatedSeconds` con el tiempo de pared transcurrido entre el inicio real y el fin efectivo de la fase, incluidas las pausas, limitado a un máximo de 28 800 segundos por fase.
- **FR-031**: Los descansos automáticos y manuales MUST heredar la tarea del WORK con tarea más reciente mientras no se inicie otro WORK ni se abandone el ciclo. Un descanso sin tarea de WORK precedente dentro del ciclo vigente MUST permanecer sin tarea y no imputar tiempo.
- **FR-032**: Al abandonar una fase, el sistema MUST guardar el instante de abandono como su fin efectivo, incluso si estaba pausada; MUST incluir en el tiempo de tarea asociado todo el tiempo de pared desde el inicio hasta el abandono, con el límite de FR-030.
- **FR-033**: Si una fase completada o abandonada no tiene tarea válida asociada, el sistema MUST guardar la fase y su tiempo activo para estadísticas, y MUST NOT incrementar el tiempo de ninguna tarea.
- **FR-034**: El sistema MUST reutilizar `Task.accumulatedSeconds` como total de tiempo de tarea y MUST NOT requerir una columna nueva ni una migración de esquema para esta funcionalidad. MUST conservar los acumulados existentes, sumar desde la activación con la semántica nueva y explicar visiblemente que el histórico previo no incluye descansos ni pausas.
- **FR-035**: Toda lectura o escritura MUST permanecer autorizada por el usuario de sesión. Una tarea ajena, inexistente o eliminada MUST NOT vincularse ni recibir tiempo; el registro de la fase MUST conservarse cuando sea válido.
- **FR-036**: El registro de la fase y la actualización de la tarea MUST ser atómicos cuando exista imputación. El sistema MUST NOT marcar una tarea como hecha automáticamente.
- **FR-037**: El sistema MUST mostrar el total de tiempo de tarea de forma coherente en `/tasks` y en el dashboard.
- **FR-038**: El navegador MUST generar un ID estable al iniciar cada fase, conservarlo con el estado local y enviarlo en solicitudes de completar, abandonar y reintentar. El ID MUST ser el ID existente del registro, sin nueva columna. La primera transacción confirmada en la base de datos MUST prevalecer. Con el mismo ID, el sistema MUST tratar la solicitud como reintento idempotente si coinciden los valores finales persistidos `phase`, `taskId`, `actualSeconds`, `startedAt`, `endedAt` y `completed`, aunque la lista de segmentos recibida sea distinta pero produzca esos mismos valores; MUST NOT duplicar sesión ni incremento de tarea. Si difiere cualquiera de esos valores, MUST rechazar la solicitud como conflicto y MUST NOT alterar el registro ni volver a incrementar la tarea. Si la finalización se confirmó primero, un abandono con el mismo ID no MUST reemplazarla.
- **FR-041**: El sistema MUST persistir `completed = false` exclusivamente para una fase abandonada y MUST registrar su `endedAt` efectivo. Una fase en curso MUST NOT persistirse. Si completar y abandonar compiten con el mismo ID, la primera transacción confirmada MUST determinar el único resultado almacenado.
- **FR-039**: Si una tarea asociada fue eliminada antes de la imputación, el sistema MUST registrar la fase sin tarea y MUST NOT incrementar ningún acumulado.
- **FR-040**: La interfaz de tareas o dashboard MUST explicar de forma visible que los acumulados históricos anteriores a esta mejora no incluyen descansos ni pausas; esos valores MUST mantenerse sin recalcular.

### Reemplazo de requisitos de la spec 002

- **FR-022 (reemplazado)**: el tiempo de tarea ya no se limita a segundos activos de WORK completados: se aplican FR-030 a FR-033. `actualSeconds` continúa representando tiempo activo y no se redefine como tiempo de pared.
- **SC-010 (reemplazado)**: no se excluyen todos los descansos; un descanso ligado a una tarea de WORK precedente sí aporta tiempo de pared a esa tarea. Un descanso sin tarea no imputa.
- Las garantías restantes de la spec 002 siguen vigentes, salvo la regla de abandono «no se registra»: toda fase abandonada se registra conforme a FR-026–FR-033. La expiración con la pestaña cerrada conserva el descarte especificado allí.

### Key Entities

- **Task**: `accumulatedSeconds` representa el total de tiempo de pared imputado a la tarea.
- **PomodoroSession**: `actualSeconds` representa tiempo activo agregado de la fase; sus timestamps delimitan el intervalo de pared; el estado `completed` distingue fase completada (`true`) de abandonada (`false`); su ID existente es la identidad estable de la fase y la tarea asociada es opcional. Los segmentos activos solo existen en el estado local/payload transitorio, no en el registro persistido.

## Success Criteria

- **SC-012**: En el 100 % de las fases guardadas, la estadística activa coincide con la suma de segundos de temporizador en marcha y excluye los intervalos en pausa, independientemente de fase, tarea y estado.
- **SC-013**: En el 100 % de las fases asociadas a una tarea válida, el incremento coincide con el tiempo de pared entre inicio y fin efectivo, incluidas las pausas, y nunca supera 28 800 segundos por fase.
- **SC-014**: El 100 % de descansos de ciclos con tarea hereda esa tarea; los descansos sin tarea previa no incrementan ningún acumulado.
- **SC-015**: Ninguna fase sin tarea, ni tarea ajena/inexistente/eliminada, incrementa el acumulado de una tarea.
- **SC-016**: Los contadores de focos y objetivos diarios solo cambian por WORK completados; ningún abandono o descanso los incrementa.
- **SC-017**: `/tasks` y el dashboard muestran el mismo acumulado para cada tarea.
- **SC-018**: En el 100 % de abandonos, el registro queda con `completed = false`; en carreras, solo se conserva el resultado de la primera transacción confirmada y no se duplica el tiempo.
- **SC-019**: En el 100 % de WORK completados que cruzan medianoche, el conteo diario corresponde al día local de inicio según la zona horaria del usuario.
- **SC-020**: El 100 % de tareas con acumulado histórico conserva su valor y muestra una explicación visible de que el histórico previo no incluye descansos ni pausas.

## Compatibilidad de datos históricos

Los campos existentes permiten separar las métricas de fases nuevas sin columna ni migración. Para las filas históricas, el criterio verificable de fallback es: `phase = WORK`, `completed = true` y `actualSeconds = 0` identifica una sesión WORK histórica y usa `plannedSeconds`, como en la spec 002. Los descansos históricos con `actualSeconds = 0` aportan cero porque no se conocen sus segmentos activos ni pausas; un abandono nuevo con `actualSeconds = 0` no recibe fallback porque `completed = false`. Los acumulados previos de `Task` no se pueden reconstruir como tiempo de pared incluyendo descansos; se conservan, y la interfaz informa de esa limitación. Esta limitación histórica queda documentada, sin decisión técnica pendiente.

## Checklist corto de convergencia

- [ ] Verificar con tests segmentos transitorios del payload, validaciones estructurales/aritméticas, truncado único de milisegundos y tope de ocho horas; confirmar que no se persisten segmentos.
- [ ] Verificar pausa/reanudación, abandono en marcha y en pausa, herencia manual/automática y día local del inicio WORK.
- [ ] Verificar carreras por ID estable, retry con mismos valores finales aunque varíen los segmentos, conflicto si difiere cualquier valor final, autorización, atomicidad, tarea eliminada y que no se completa automáticamente.
- [ ] Verificar reglas históricas, conservación del acumulado y explicación visible, además de coherencia entre lista de tareas y dashboard.
- [ ] Pasar `npm run test`, `npm run lint` y `npm run typecheck`.
