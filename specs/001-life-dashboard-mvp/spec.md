# Feature Specification: Life Dashboard (MVP)

**Feature Branch**: `001-life-dashboard-mvp`

**Created**: 2026-10-12

**Status**: Draft (baseline del producto)

**Input**: Panel personal de productividad de **cuenta única**: tareas con
rachas por categoría, temporizador Pomodoro persistente, notas con autoguardado
y ajustes, desplegable en Vercel sobre PostgreSQL (Neon).

## User Scenarios & Testing *(obligatorio)*

### User Story 1 - Acceso a la cuenta única (Priority: P1)

El propietario abre la aplicación e inicia sesión con su email y contraseña. Si
ya tiene sesión válida, entra directamente; si no, es redirigido a `/login`.
Puede cerrar sesión cuando quiera.

**Why this priority**: sin autenticación no hay acceso a ningún otro dato; es la
base de todo el producto.

**Independent Test**: con la cuenta sembrada, iniciar sesión en `/login` lleva a
`/dashboard`; una ruta privada sin sesión redirige a `/login`; cerrar sesión
devuelve a `/login` y bloquea de nuevo las rutas privadas.

**Acceptance Scenarios**:

1. **Given** credenciales correctas, **When** el usuario envía el formulario,
   **Then** se crea la sesión y accede a `/dashboard`.
2. **Given** credenciales incorrectas, **When** envía el formulario, **Then** ve
   un error genérico sin revelar si el usuario existe, y no se crea sesión.
3. **Given** una sesión activa, **When** visita una ruta privada, **Then**
   accede sin volver a autenticarse.
4. **Given** una sesión cerrada, **When** visita una ruta privada, **Then** es
   redirigido a `/login`.
5. **Given** el mismo email+IP, **When** supera 5 intentos fallidos en 15 min,
   **Then** se rechazan temporalmente los intentos.

---

### User Story 2 - Tareas, categorías y rachas (Priority: P2)

El usuario crea tareas con categoría, estado, prioridad y vencimiento opcional;
las completa; y ve su racha (días consecutivos de actividad) por categoría.

**Why this priority**: es el núcleo de valor del producto (productividad).

**Independent Test**: crear una tarea, completarla y comprobar que la racha de la
categoría de hoy se marca como cumplida y que la racha actual se calcula bien
(hoy o ayer).

**Acceptance Scenarios**:

1. **Given** el usuario en `/tasks`, **When** crea una tarea válida, **Then**
   aparece en la lista con su categoría y estado pendiente.
2. **Given** una tarea pendiente, **When** la marca completada, **Then** su
   estado cambia y se registra el día de actividad de su categoría.
3. **Given** tareas con distinto estado/prioridad, **When** filtra, **Then** solo
   ve las que cumplen el criterio.
4. **Given** una tarea con vencimiento, **When** se guarda, **Then** el día mostrado
   es el elegido por el usuario (sin desplazarse por zona horaria).
5. **Given** días consecutivos con actividad, **When** consulta la racha, **Then**
   ve el número correcto de días (y la más larga).

---

### User Story 3 - Temporizador Pomodoro persistente (Priority: P3)

El usuario lanza un Pomodoro (foco/descanso) con la duración configurada; el
temporizador sobrevive al cierre de la pestaña y se reanuda con el tiempo real
restante. Al terminar, se registra la sesión.

**Why this priority**: aporta valor claro, pero depende de la gestión de tareas
para tener contexto de trabajo.

**Independent Test**: iniciar una sesión, recargar o cerrar la pestaña y
reabrirla antes de 24 h; el tiempo restante es coherente; al completar aparece
en las estadísticas; si expiró estando cerrada, no se cuenta.

**Acceptance Scenarios**:

1. **Given** una duración configurada, **When** inicia una sesión, **Then** el
   temporizador cuenta atrás de forma continua.
2. **Given** una sesión en curso, **When** cierra y reabre la pestaña antes de
   24 h, **Then** se reanuda con el tiempo restante real.
3. **Given** una sesión cuyo tiempo expiró con la pestaña cerrada, **When**
   vuelve, **Then** la sesión se descarta y no se registra.
4. **Given** una sesión completada, **When** termina, **Then** se crea un registro
   con fase y duración y las estadísticas (hoy/total) se actualizan.
5. **Given** varias sesiones completadas, **When** alcanza el intervalo
   configurado, **Then** se sugiere un descanso largo.

---

### User Story 4 - Notas con autoguardado (Priority: P4)

El usuario escribe notas que se guardan solas (sin botón), y puede fijarlas para
que aparezcan arriba.

**Why this priority**: complementa el flujo, pero es secundaria frente a tareas y
Pomodoro.

**Independent Test**: escribir en una nota y esperar ~1 s; recargar y comprobar
que el contenido se conservó; fijar una nota y ver que sube en la lista.

**Acceptance Scenarios**:

1. **Given** una nota abierta, **When** el usuario escribe, **Then** el contenido
   se guarda automáticamente tras un breve intervalo sin escribir.
2. **Given** una nota ya guardada, **When** recarga la página, **Then** el
   contenido persistido se muestra.
3. **Given** varias notas, **When** fija una, **Then** aparece antes que las no
   fijadas, ordenadas por última edición.

---

### User Story 5 - Ajustes, preferencias y dashboard (Priority: P5)

El usuario ajusta preferencias (tema claro/oscuro/sistema, zona horaria,
duración de Pomodoro, objetivo diario) y ve un resumen del día en el dashboard.

**Why this priority**: mejora la experiencia, pero el producto es útil sin
personalizar.

**Independent Test**: cambiar el tema y la zona horaria; persisten tras recargar
y afectan al cálculo de días/rachas.

**Acceptance Scenarios**:

1. **Given** el usuario en `/settings`, **When** cambia el tema, **Then** la
   interfaz lo refleja y persiste.
2. **Given** una zona horaria distinta de la del servidor, **When** consulta
   rachas o vencimientos, **Then** el "día" corresponde a su zona.
3. **Given** datos existentes, **When** abre `/dashboard`, **Then** ve resumen de
   tareas, rachas y próximos vencimientos del día.

### Edge Cases

- **Sesión expirada** durante la navegación → se redirige a `/login` sin errores
  de render.
- **Categoría obligatoria**: crear una tarea sin categoría debe rechazarse con un
  mensaje claro (no hay categoría por defecto).
- **Borrado irreversible**: eliminar una tarea o una nota es definitivo y no se
  puede deshacer; la UI pide confirmación.
- **Zona horaria inválida** en preferencias → no rompe el cálculo; se cae a una
  zona por defecto.
- **Nota vacía**: no debe crear registros basura en cada tecla.
- **Vencimiento a medianoche**: el día mostrado no cambia según la zona del
  servidor.
- **Base de datos no disponible**: `/api/health` lo reporta; las páginas
  muestran error controlado, no una traza.

## Requirements *(obligatorio)*

### Functional Requirements

- **FR-001**: El sistema MUST exponer solo rutas públicas `/`, `/login` y
  `/api/health`; el resto requiere sesión.
- **FR-002**: El sistema MUST autenticar con email+contraseña contra la cuenta
  sembrada y crear una sesión opaca en cookie `httpOnly`.
- **FR-003**: El sistema MUST hashear las contraseñas con bcrypt (12 rondas) y
  guardar solo el hash SHA-256 del token de sesión.
- **FR-004**: El sistema MUST limitar a 5 intentos de login por IP+email cada 15
  minutos (best-effort).
- **FR-005**: El sistema MUST permitir crear, editar, completar y **eliminar
  definitivamente** tareas, con **categoría obligatoria**, estado
  (`pendiente` / `en curso` / `hecha`), prioridad (`baja` / `media` / `alta`) y
  vencimiento opcional.
- **FR-006**: El sistema MUST calcular y mostrar rachas por categoría
  (actual y más larga) usando días locales `YYYY-MM-DD`.
- **FR-007**: El sistema MUST ofrecer un temporizador Pomodoro reanudable por
  instante de fin (`endAt`) dentro de 24 h, y registrar las sesiones completadas.
- **FR-008**: El sistema MUST autoguardar las notas en el servidor tras un breve
  intervalo y permitir fijarlas.
- **FR-009**: El sistema MUST persistir preferencias de usuario (tema, zona
  horaria, duración Pomodoro, objetivo diario).
- **FR-010**: El sistema MUST aislar los datos por el usuario de sesión en toda
  consulta de escritura.
- **FR-011**: El sistema MUST sobrevivir al despliegue serverless necesitando
  únicamente `DATABASE_URL` en runtime.
- **FR-012**: El sistema MUST ofrecer `/api/health` que verifique la conexión a
  la base de datos.
- **FR-013**: Cada nota MUST tener **título y contenido**; el sistema MUST
  autoguardar ambos y permitir **eliminarla definitivamente**.
- **FR-014**: En el primer login, el sistema MUST **autodetectar la zona horaria
  del navegador** y usarla como preferencia hasta que el usuario la cambie en
  Ajustes.

### Key Entities *(incluir si hay datos)*

- **User**: propietario único; email, contraseña (hash), nombre, zona horaria.
- **Session**: sesión opaca; hash de token, expiración, relación con `User`.
- **UserPreferences**: tema, duración Pomodoro, objetivo diario, notificaciones.
- **Category**: agrupación de tareas; color; usada para rachas.
- **Task**: título, descripción, estado (`pendiente` / `en curso` / `hecha`),
  prioridad (`baja` / `media` / `alta`), `dueDate` (medianoche UTC), categoría
  (**obligatoria**), etiquetas.
- **StreakDay**: día de actividad por `(usuario, categoría)` con `date` local
  `YYYY-MM-DD`.
- **PomodoroSession**: fase, segundos planificados, inicio y fin.
- **Note**: **título y contenido** con autoguardado; indicador de fijado.
- **Tag** / **NoteTag** / **TaskTag**: etiquetas (esquema listo; uso en fase
  posterior).
- **IntegrationConfig**: configuración de conectores OAuth (fase posterior);
  tokens cifrados en servidor.

## Success Criteria *(obligatorio)*

### Measurable Outcomes

- **SC-001**: Un usuario con credenciales válidas accede al dashboard en menos de
  2 minutos desde que abre la app.
- **SC-002**: El 100 % de las rutas privadas redirige a `/login` sin sesión
  (0 accesos sin autenticar).
- **SC-003**: El "día" mostrado en rachas y vencimientos coincide con la zona
  horaria del usuario en el 100 % de los casos (incluidos vencimientos a
  medianoche y zonas distintas de UTC).
- **SC-004**: Una sesión Pomodoro en curso se reanuda correctamente al reabrir la
  pestaña dentro de 24 h en el 100 % de los intentos.
- **SC-005**: Las notas se conservan tras recargar en el 100 % de los casos tras
  el intervalo de autoguardado.
- **SC-006**: Una respuesta de `/api/health` con `{"status":"ok"}` se obtiene en
  menos de 2 s con la base disponible.

## Clarifications

### Session 2026-10-12

- Q: ¿Valores de estado y prioridad de una tarea? → A: Estado
  `pendiente` / `en curso` / `hecha`; prioridad `baja` / `media` / `alta`.
  (FR-005, entidad `Task`)
- Q: ¿La categoría es obligatoria al crear una tarea? → A: Sí, obligatoria.
  (FR-005, Edge Cases)
- Q: ¿Cómo se eliminan tareas y notas? → A: Borrado definitivo (hard delete), sin
  papelera ni archivado. (FR-005, FR-013)
- Q: ¿Cómo se determina la zona horaria? → A: Autodetectada del navegador en el
  primer login, editable en Ajustes. (FR-014)
- Q: ¿Estructura de una nota? → A: Título + contenido. (FR-013, entidad `Note`)

## Assumptions

- **Un solo usuario**: no hay registro público ni roles; la cuenta se crea por
  seed.
- **Conectividad**: el usuario tiene conexión estable; no hay modo offline en v1.
- **Alcance v1**: la integración Gmail/OAuth y las etiquetas (`Tag`) quedan fuera;
  el esquema ya las contempla.
- **Rate limit**: aceptar su naturaleza best-effort en serverless hasta migrar a
  un almacén compartido.
- **Navegador**: se soportan navegadores modernos con `localStorage` (usado por
  el Pomodoro).
