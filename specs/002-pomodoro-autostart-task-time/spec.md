# Feature Specification: Pomodoro con auto-avance y tiempo por tarea

**Feature Branch**: `002-pomodoro-autostart-task-time`

**Created**: 2026-10-13

**Estado**: Borrador

**Input**: El usuario quiere que el Pomodoro pueda encadenar fases sin intervención
(una configuración adicional que lo lleve de concentración a descanso y viceversa,
avisando al terminar cada fase como hasta ahora), y que las tareas acumulen el
tiempo invertido en ellas cuando se les asigna una sesión de concentración.

## User Scenarios & Testing *(obligatorio)*

### User Story 1 - Auto-avance continuo de fases (Priority: P1)

El propietario activa en los ajustes el encadenado automático de fases. A partir de
ahí, al terminar una concentración el temporizador arranca solo el descanso que
corresponda (corto, o largo cuando toque según el intervalo configurado) y, al
terminar el descanso, arranca de nuevo la concentración. El ciclo continúa hasta que
el usuario lo detiene. En cada cambio de fase se avisa como hasta ahora.

**Why this priority**: es el núcleo de la petición; sin esto no hay encadenado.

**Independent Test**: con la opción activada, iniciar una concentración con una
duración corta y comprobar que, al llegar a cero, arranca sola la siguiente fase
(descanso), que el aviso se dispara en cada fin de fase, y que al pulsar «Abandonar»
el ciclo se detiene y no encadena nada más.

**Acceptance Scenarios**:

1. **Given** el auto-avance activado, **When** termina una concentración, **Then**
   la siguiente fase (descanso) arranca sola, sin intervención, y se avisa del fin.
2. **Given** el auto-avance activado y un descanso en curso, **When** termina el
   descanso, **Then** arranca sola la concentración y se avisa del fin.
3. **Given** el auto-avance activado, **When** se alcanza el intervalo configurado de
   sesiones de concentración, **Then** el descanso encadenado es el **largo**; en el
   resto de casos es el corto.
4. **Given** el ciclo en curso, **When** el usuario pulsa «Abandonar»/«Anular»,
   **Then** el ciclo se detiene y la sesión en curso no se registra.
5. **Given** el auto-avance **desactivado**, **When** termina una fase, **Then** el
   comportamiento es el actual: se registra la sesión y el temporizador queda listo
   sin arrancar solo.

---

### User Story 2 - Asignar una tarea a una sesión de concentración (Priority: P2)

Antes de iniciar una concentración, el usuario puede elegir opcionalmente una de sus
tareas pendientes. Mientras la sesión corre, la asignación no se puede cambiar: para
trabajar en otra tarea hay que iniciar una sesión nueva. El tiempo que transcurre en
la concentración se suma al tiempo invertido de esa tarea.

**Why this priority**: da sentido al tiempo por tarea, pero depende de que exista el
cómputo de tiempo.

**Independent Test**: asignar una tarea a una concentración, dejarla terminar y
comprobar que el tiempo de la tarea aumentó en la duración de esa concentración;
iniciar otra concentración y comprobar que la tarea vuelve a elegirse desde cero.

**Acceptance Scenarios**:

1. **Given** el usuario en el temporizador, **When** elige una tarea pendiente y
   arranca la concentración, **Then** la sesión queda asociada a esa tarea.
2. **Given** una concentración en curso con tarea asignada, **When** el usuario
   intenta cambiar la tarea, **Then** no puede hacerlo mientras la sesión corre.
3. **Given** una concentración completada con tarea asignada, **When** se registra la
   sesión, **Then** el tiempo real transcurrido se suma al tiempo acumulado de la
   tarea.
4. **Given** una sesión de descanso, **When** termina, **Then** no imputa tiempo a
   ninguna tarea.
5. **Given** una tarea sin sesiones asignadas, **When** se completan concentraciones
   sin tarea, **Then** su tiempo acumulado no cambia.
6. **Given** una concentración terminada, **When** se registra, **Then** la tarea
   **no** se marca como hecha automáticamente.

---

### User Story 3 - Ver el tiempo acumulado por tarea (Priority: P3)

El usuario ve cuánto tiempo lleva invertido en cada tarea, tanto en la lista de tareas
como en el resumen del dashboard.

**Why this priority**: hace visible y útil el dato que generan las sesiones; es
secundario respecto a capturarlo.

**Independent Test**: con una tarea que tiene tiempo acumulado, abrir `/tasks` y el
dashboard y comprobar que el tiempo se muestra con el mismo valor en ambos.

**Acceptance Scenarios**:

1. **Given** una tarea con tiempo acumulado, **When** el usuario abre `/tasks`,
   **Then** ve el tiempo total invertido en esa tarea.
2. **Given** tareas con y sin tiempo acumulado, **When** el usuario abre el dashboard,
   **Then** ve el tiempo de las tareas que lo tienen.
3. **Given** una tarea sin tiempo acumulado, **When** se muestra, **Then** no aparece
   un tiempo engañoso (se omite o se muestra vacío/cero de forma clara).

---

### Edge Cases

- **Auto-avance con la pestaña cerrada**: al reabrir dentro de 24 h se reanuda la fase
  que estaba en curso; si su tiempo ya expiró, esa fase se descarta y **no** se
  encadena la siguiente.
- **Detener el ciclo**: pausar lo mantiene detenido; abandonar/anular cancela la
  sesión en curso y no la registra.
- **Descanso largo**: se elige según el intervalo configurado de sesiones de
  concentración; con el auto-avance activo, la cuenta sigue avanzando tras el largo.
- **Tarea borrada durante una sesión**: la sesión deja de estar asociada (la relación se
  anula), pero el tiempo ya acumulado en otras tareas se conserva.
- **Sin tarea asignada**: la concentración se registra igual, sin imputar tiempo a
  ninguna tarea.
- **Notificaciones denegadas por el navegador**: el ciclo funciona igual; solo no hay
  aviso, sin errores.
- **Tiempo real vs. pausas**: el tiempo imputado es el que el temporizador ha estado
  corriendo; el tiempo en pausa no cuenta.
- **Concentración muy larga/corta**: el tiempo imputado respeta los límites de duración
  ya admitidos por la configuración del Pomodoro.

## Requirements *(obligatorio)*

### Functional Requirements

- **FR-015**: El sistema MUST ofrecer una **preferencia configurable, desactivada por
  defecto**, que active el encadenado automático de fases del Pomodoro.
- **FR-016**: Con el auto-avance activo, al terminar una **concentración**, el sistema
  MUST iniciar automáticamente el **descanso** que corresponda (corto, o largo cuando
  se alcance el intervalo configurado).
- **FR-017**: Con el auto-avance activo, al terminar un **descanso**, el sistema MUST
  iniciar automáticamente una **concentración**.
- **FR-018**: El sistema MUST mantener el ciclo encadenado de forma continua **hasta
  que el usuario lo detenga**; detenerlo (pausa/abandono) MUST impedir que se encadene
  la siguiente fase.
- **FR-019**: Al terminar **cualquier** fase (concentración o descanso), el sistema
  MUST avisar al usuario mediante notificación cuando las notificaciones estén activas.
- **FR-020**: El sistema MUST conservar el comportamiento actual del temporizador
  (persistencia por instante de fin, reanudación dentro de 24 h y descarte si expira
  con la pestaña cerrada) también cuando el auto-avance esté activo.
- **FR-021**: El usuario MUST poder asignar **opcionalmente** una tarea a una sesión de
  **concentración**; la asignación MUST quedar fija durante la sesión y MUST poder
  establecerse de nuevo solo al iniciar una sesión nueva.
- **FR-022**: Al completarse una sesión de concentración con tarea asignada, el sistema
  MUST sumar al tiempo acumulado de esa tarea los **segundos reales** que el
  temporizador ha estado corriendo. Las fases de descanso MUST NOT imputar tiempo.
- **FR-023**: El sistema MUST mostrar el **tiempo acumulado** de cada tarea en la lista
  de tareas y en el dashboard.
- **FR-024**: El sistema MUST persistir el estado de la preferencia de auto-avance como
  parte de las preferencias del usuario.
- **FR-025**: El sistema MUST NOT marcar una tarea como hecha al terminar una sesión de
  concentración asignada a ella.

### Key Entities *(incluir si hay datos)*

- **UserPreferences**: se añade el estado del **auto-avance de fases** (activado/
  desactivado), junto a las preferencias de Pomodoro ya existentes (duraciones,
  intervalo de descanso largo, objetivo diario, notificaciones).
- **Task**: se añade el **tiempo acumulado** invertido en la tarea.
- **PomodoroSession**: ya contempla la fase, la duración y la tarea asociada; se usa
  para imputar el tiempo de cada concentración completada a su tarea.

## Success Criteria *(obligatorio)*

### Measurable Outcomes

- **SC-007**: Con el auto-avance activo, el 100 % de las fases completadas encadenan la
  siguiente fase sin intervención del usuario.
- **SC-008**: El aviso de fin de fase se produce en el 100 % de las fases terminadas
  (concentración y descanso) cuando las notificaciones están activas.
- **SC-009**: El tiempo acumulado de una tarea aumenta exactamente en la duración real
  de cada concentración completada asignada a ella, en el 100 % de los casos.
- **SC-010**: Ninguna sesión de descanso incrementa el tiempo de una tarea.
- **SC-011**: El tiempo acumulado de una tarea coincide entre `/tasks` y el dashboard
  para la misma tarea.

## Assumptions

- **Alcance**: esta spec cubre solo la funcionalidad de Pomodoro (auto-avance +
  asignación de tarea y cómputo de tiempo). El defecto de que una tarea recién creada
  no aparezca sin recargar queda **fuera** de esta spec y se corrige aparte.
- **Auto-avance por defecto desactivado**: el comportamiento actual se conserva salvo
  que el usuario active la opción.
- **Tiempo real ≈ duración de concentración**: en una sesión completada, el
  temporizador corre exactamente la duración configurada (el reloj se detiene al
  pausar), por lo que el tiempo imputado coincide con los minutos de concentración.
- **Focos automáticos**: con el auto-avance activo, la concentración que arranca sola
  tras un descanso continúa con la **misma tarea** del foco anterior.
- **Un solo usuario**: no hay multiusuario; toda lectura/escritura filtra por el
  usuario de sesión.
- **Despliegue**: los cambios de datos son aditivos (con valor por defecto), por lo que
  el despliegue en Vercel funciona tras aplicar la migración.
