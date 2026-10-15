# Feature Specification: Calendario integrado

**Feature Branch**: `004-calendar`

**Created**: 2026-10-15

**Estado**: aprobada

**Input**: «Calendario dentro de la aplicación con categoría propia. Primer Sprint del calendario no requiere de compatibilidad con google calendar».

## Propósito y alcance

La aplicación tendrá un módulo propio de calendario en `/calendar`, con eventos gestionados dentro de Life Dashboard y tareas existentes representadas en la fecha de vencimiento (`Task.dueDate`). El módulo reutiliza las categorías y colores ya existentes; no crea categorías paralelas ni sincroniza con Google Calendar.

El primer sprint incluye una vista de mes con semana de lunes a domingo y una agenda para el día seleccionado. El usuario podrá crear, editar y borrar eventos de un solo día, de día completo o con horario. No incluye recurrencia, notificaciones, eventos de varios días ni creación de tareas desde el calendario. El dashboard mostrará una tarjeta con los próximos eventos.

## User Story - Planificar en un calendario

Como usuario, quiero consultar en un mismo calendario mis eventos y las fechas de vencimiento de mis tareas, para organizar el mes y ver la agenda de cada día. También quiero crear eventos con una categoría para reconocerlos por su color.

**Why this priority**: centraliza la planificación cotidiana sin depender de una cuenta o servicio externo y aprovecha las tareas y categorías que ya existen en la aplicación.

**Independent Test**: abrir `/calendar`, navegar a un mes, seleccionar un día con vencimientos, crear un evento de día completo y otro con horario y categoría, comprobar que aparecen en la fecha correcta y en la agenda; editar y borrar uno y confirmar que los cambios se reflejan. Verificar además que `/dashboard` presenta los eventos próximos.

### Acceptance Scenarios

1. **Given** el usuario autenticado, **When** abre `/calendar`, **Then** ve el mes actual según su zona horaria, una cuadrícula que empieza en lunes y la agenda del día seleccionado.
2. **Given** el usuario está viendo otro mes o día, **When** pulsa el botón «Hoy», **Then** el calendario navega al mes actual según la zona horaria del usuario, selecciona la fecha de hoy y muestra su agenda.
3. **Given** tareas con `dueDate`, **When** se muestra el calendario, **Then** cada tarea aparece en su día de vencimiento y conserva su estado; las completadas se distinguen visualmente de las pendientes.
4. **Given** el usuario crea un evento de día completo, **When** guarda un título, fecha y categoría opcional, **Then** el evento aparece en la celda y agenda de ese día con el color de su categoría.
5. **Given** el usuario crea un evento con horario, **When** introduce inicio y fin válidos, **Then** el calendario muestra la franja horaria en la fecha local seleccionada.
6. **Given** un evento existente, **When** el usuario lo edita o elimina, **Then** solo cambia o desaparece ese evento y se actualizan calendario y agenda.
7. **Given** una categoría reutilizada por un evento, **When** el usuario la elimina, **Then** el evento se conserva sin categoría ni color asociado.
8. **Given** una categoría inexistente o perteneciente a otro usuario, **When** se intenta asignar a un evento, **Then** la operación se rechaza y no se escribe ningún dato.
9. **Given** varios eventos próximos, **When** el usuario abre `/dashboard`, **Then** ve una tarjeta de próximos eventos con enlace al calendario y fechas mostradas según su zona horaria.
10. **Given** el usuario navega por meses o cambia de año, **When** el mes tiene distinta cantidad de días o empieza en otro día de la semana, **Then** la cuadrícula conserva la alineación lunes-domingo, incluye los días necesarios de relleno y selecciona fechas correctas.
11. **Given** un día sin eventos ni tareas con vencimiento, **When** se selecciona, **Then** la agenda presenta un estado vacío claro y permite crear un evento para ese día.

## Semántica y casos límite

- **Identidad del módulo y categorías**: `/calendar` es una sección de producto propia. Los eventos guardan una relación opcional con `Category`, la misma entidad usada por tareas y rachas. Los eventos no crean ni incrementan `StreakDay`; las rachas siguen dependiendo de completar tareas según las reglas existentes.
- **Fechas locales**: el día de un evento se guarda como clave `YYYY-MM-DD` (`dateKey`), no como timestamp UTC. El mes inicial, “hoy”, la selección inicial y los límites de próximos eventos se calculan en `User.timezone`. Las tareas se muestran en la fecha de vencimiento existente, respetando su semántica de fecha sin hora. El calendario no debe desplazar un día por convertir una fecha local a UTC.
- **Horas locales**: un evento con horario guarda minutos enteros desde medianoche local (`startMinutes`, `endMinutes`); no son timestamps UTC. `startMinutes` está entre 0 y 1439; `endMinutes` es exclusivo y está entre 1 y 1440. Debe cumplirse `endMinutes > startMinutes`; 1440 representa el final del día. No se permiten intervalos que crucen a otro día. No se hacen conversiones de zona horaria ni se envían invitaciones.
- **Día completo**: si `allDay = true`, ambos campos de minutos son nulos. Si `allDay = false`, ambos son obligatorios y válidos. La fecha del evento es siempre un solo día.
- **Orden**: en la agenda, los eventos de día completo preceden a los eventos con hora; estos se ordenan por hora de inicio. Las tareas con vencimiento se muestran en una sección diferenciada, sin fingir que son eventos horarios.
- **Cuadrícula mensual**: empieza en lunes y muestra semanas completas necesarias para cubrir el mes (cinco o seis filas según el calendario). Las fechas de relleno son navegables/seleccionables, pero se distinguen del mes visible. En una celda con más elementos de los que caben, la interfaz limita los elementos visibles y muestra un indicador de elementos restantes; la agenda del día permite verlos todos.
- **Filtro por categoría**: controla la visibilidad de eventos y tareas categorizados; “sin categoría” es una opción distinguible. El estado inicial muestra todas las categorías. La lista de categorías siempre procede del usuario autenticado.
- **Estados de tareas**: se muestran tareas con fecha de vencimiento de cualquier estado. Las completadas se visualizan atenuadas y las pendientes vencidas se marcan comparando su clave local con “hoy”; no se modifican estado, vencimiento ni rachas desde el calendario.
- **Dashboard**: la tarjeta lista eventos desde hoy hasta los próximos siete días naturales locales, inclusive; no cambia ni duplica los contadores existentes. Si no hay eventos en ese rango, presenta un estado vacío discreto y un enlace a `/calendar`.
- **Autorización y relaciones**: toda consulta/mutación requiere sesión y filtra por `userId`. Una categoría debe existir y pertenecer al usuario. El borrado de usuario elimina sus eventos (`Cascade`); el borrado de categoría conserva eventos y establece `categoryId = null` (`SetNull`).
- **Edición concurrente o envíos duplicados**: las Server Actions validan datos en servidor; una petición inválida no altera el evento. La interfaz deshabilita el envío mientras se guarda y presenta errores sin perder los campos introducidos.
- **Fuera de alcance**: sincronización o importación/exportación con Google Calendar u otros proveedores; OAuth; recurrencia; notificaciones/recordatorios; eventos multidía o que crucen medianoche; calendarios compartidos; edición de tareas desde el calendario; vista semanal/lista como vista principal.

## Requirements

### Functional Requirements

- **FR-042**: El sistema MUST ofrecer una ruta autenticada `/calendar` accesible desde la navegación principal.
- **FR-043**: El sistema MUST mostrar una cuadrícula mensual navegable, con semanas de lunes a domingo, y una agenda para el día seleccionado. El mes inicial y la fecha actual MUST basarse en la zona horaria del usuario.
- **FR-055**: La vista `/calendar` MUST ofrecer un botón claramente identificado como «Hoy» que, al activarse, navegue al mes actual según la zona horaria del usuario, seleccione la fecha de hoy y actualice la agenda del día.
- **FR-044**: El sistema MUST permitir consultar tareas existentes con fecha de vencimiento en la fecha local correspondiente. MUST mostrar sus estados de forma distinguible y MUST NOT mutar tareas ni rachas desde el calendario.
- **FR-045**: El sistema MUST permitir crear, leer, editar y borrar eventos propios de un único día, con título obligatorio, descripción opcional y categoría opcional.
- **FR-046**: Los eventos MUST admitir día completo o una franja horaria local. Los campos horarios MUST cumplir las reglas de `startMinutes` y `endMinutes` descritas en semántica; intervalos inválidos, de duración cero/negativa o que crucen de día MUST rechazarse.
- **FR-047**: El sistema MUST reutilizar la entidad `Category` y sus colores. Las operaciones MUST validar que la categoría pertenezca al usuario; borrar una categoría MUST conservar los eventos relacionados sin categoría.
- **FR-048**: El día del evento MUST persistirse como clave local `YYYY-MM-DD`; las horas MUST persistirse como minutos del día local, sin convertirlas en timestamps UTC. La cuadrícula y las fechas de la agenda MUST respetar `User.timezone` y las convenciones existentes para fechas de vencimiento.
- **FR-049**: Toda lectura o escritura de calendario MUST autorizarse en servidor y limitarse al usuario de sesión. Una petición no autenticada MUST rechazarse; los identificadores ajenos o inexistentes MUST NOT permitir lectura, edición ni borrado.
- **FR-050**: Los eventos MUST ordenarse en la agenda: primero día completo y luego por hora de inicio. Las tareas MUST mostrarse diferenciadas de los eventos. Las celdas con exceso de elementos MUST indicar que hay elementos adicionales y la agenda MUST permitir consultarlos todos.
- **FR-051**: La interfaz MUST permitir filtrar eventos y tareas por categoría, con una opción para elementos sin categoría y una opción inicial para mostrar todas.
- **FR-052**: El dashboard MUST mostrar una tarjeta de próximos eventos en el rango de hoy a los siete días naturales locales siguientes, con enlace a `/calendar`; la ausencia de eventos MUST representarse sin error.
- **FR-053**: La interfaz MUST ser utilizable en móvil y escritorio, mostrar estados vacíos y errores de validación, y ofrecer controles accesibles para navegar meses, seleccionar días y gestionar eventos.
- **FR-054**: El primer sprint MUST NOT sincronizar con Google Calendar ni otros proveedores, ni incluir eventos recurrentes, multidía, recordatorios, calendarios compartidos o edición de tareas.

### Key Entities

- **CalendarEvent**: evento propiedad de un usuario, con título, descripción opcional, fecha local, indicador de día completo, minutos locales opcionales y relación opcional con una categoría.
- **Category**: entidad existente compartida por tareas y eventos; sus colores se utilizan para distinguir eventos. No se añade una categoría reservada ni se alteran sus efectos sobre rachas.
- **Task**: entidad existente que puede aparecer de forma derivada en la fecha de vencimiento; el calendario no crea ni modifica tareas.
- **User**: propietario de eventos y fuente de la zona horaria para interpretar días y horas locales.

## Success Criteria

- **SC-021**: El usuario puede consultar cualquier mes y seleccionar cualquier día sin errores de alineación en cambios de año, meses de distinta longitud y años bisiestos.
- **SC-028**: Desde cualquier mes y día seleccionado, una sola activación del botón «Hoy» muestra el mes y la agenda de la fecha actual del usuario.
- **SC-022**: Crear, editar y borrar un evento se refleja en la cuadrícula y agenda, y solo afecta datos del usuario autenticado.
- **SC-023**: El 100 % de eventos se muestra en la fecha local guardada, sin desfase por la zona del servidor o por medianoche UTC.
- **SC-024**: El 100 % de eventos con hora respeta el intervalo local validado; datos incompletos, fuera de rango o con fin no posterior al inicio se rechazan.
- **SC-025**: Las tareas con vencimiento aparecen diferenciadas de eventos y ninguna interacción del calendario modifica su estado o las rachas.
- **SC-026**: El dashboard muestra los eventos dentro del rango local de siete días y enlaza al calendario.
- **SC-027**: La revisión de escritorio y móvil confirma que la cuadrícula, la agenda, el desbordamiento y los formularios son utilizables y accesibles.

## Compatibilidad y despliegue de datos

Esta funcionalidad introduce una entidad nueva y requiere una migración aditiva que cree `CalendarEvent`, sus índices y relaciones con `User` y `Category`. Los campos obligatorios no necesitan valores por defecto porque no existen filas previas. La relación con `User` usa borrado en cascada; la relación opcional con `Category` usa `SetNull`. Antes de activar el código en producción, se debe generar y revisar la migración, regenerar el cliente Prisma y aplicar las migraciones con `npm run db:deploy`. No se requiere Google OAuth ni cambiar las variables de entorno actuales.

## Checklist corto de convergencia

- [ ] Probar navegación de meses, semanas lunes-domingo, año bisiesto, límites de mes/año y selección de fechas de relleno.
- [ ] Probar el botón «Hoy» desde otro mes y desde otro día del mes, incluyendo zona horaria distinta a la del servidor.
- [ ] Probar validación de fecha local, eventos todo el día y horarios válidos e inválidos, incluido final de día (1440) y cruce de medianoche.
- [ ] Probar CRUD, autorización por usuario, categoría ajena/inexistente y borrado de categoría con `SetNull`.
- [ ] Probar tareas por vencimiento y categoría, estados vencido/completado, y que no se muten tarea ni racha.
- [ ] Probar rango de próximos siete días locales del dashboard, estado vacío y zona horaria.
- [ ] Verificar responsive/accesibilidad en escritorio y móvil; ejecutar `npm run test`, `npm run lint`, `npm run typecheck` y `npm run build`.
- [ ] Revisar la migración y validar `npm run db:deploy` antes del despliegue a producción.
