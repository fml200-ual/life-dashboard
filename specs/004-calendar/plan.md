# Plan: Calendario integrado

**Feature**: `004-calendar` | **Spec**: [spec.md](./spec.md)

## Enfoque

Añadir una entidad propia `CalendarEvent` y una ruta `/calendar`, con una vista mensual y agenda diaria. El servidor carga los eventos y las tareas con vencimiento del mes solicitado; el cliente permite navegar meses/días, filtrar por categorías y gestionar eventos mediante Server Actions. El mes y día seleccionados se representan en parámetros de URL (`month=YYYY-MM` y `day=YYYY-MM-DD`) para que navegación, recarga y enlaces mantengan un estado válido.

El modelo de evento guarda el día como clave local `YYYY-MM-DD`, y las horas como minutos desde medianoche local. Eventos todo el día llevan minutos nulos; eventos horarios llevan ambos minutos validados. El calendario reutiliza `Category`; no añade categorías de calendario ni efectos sobre rachas. La superposición de tareas es solo lectura y usa la fecha de vencimiento existente.

El trabajo será test-first con Vitest y dobles de Prisma, sin red ni base de datos real en las pruebas. Toda lectura/escritura se limita a `userId`; `requireUser()` protege la página y `getCurrentUser()` cada Server Action. No se añade dependencia de calendario. Antes de tocar APIs de Next.js 16 se consultará la documentación local en `node_modules/next/dist/docs/`, según `AGENTS.md`.

## Archivos previstos y cobertura

| Archivos | Cambio | Requisitos |
| --- | --- | --- |
| `tests/unit/calendar.test.ts`, `src/lib/calendar.ts` | Primero tests para claves locales válidas, rangos de mes, cuadrícula lunes-domingo (incluidos bisiestos y celdas de relleno), navegación, orden de agenda y reglas puras. Luego implementar helpers sin reloj implícito; recibir `today`, mes y zona horaria explícitamente cuando proceda. | FR-043, FR-048, FR-050, FR-055 |
| `prisma/schema.prisma`, `prisma/migrations/<timestamp>_calendar_events/migration.sql` | Añadir `CalendarEvent`, relaciones `User` (Cascade) y `Category?` (SetNull), índices por usuario/fecha y categoría. Generar/revisar migración aditiva; regenerar cliente. | FR-045, FR-047–049 |
| `src/lib/validations.ts`, `src/app/actions/calendar.ts`, `tests/unit/calendar-action.test.ts` | Esquema Zod para fechas/duración/campos de día completo y horario. Acciones autenticadas create/update/delete con validación de propiedad del evento y categoría, manejo de categoría nula y revalidación de `/calendar` y `/dashboard`. La carga queda en la página server. | FR-045–049 |
| `src/app/(app)/calendar/page.tsx` | `requireUser()`, parseo seguro de `searchParams`, mes/día iniciales basados en `user.timezone`; consultar eventos del rango visible y tareas vencidas del mismo rango. Convertir el rango de claves locales a límites UTC según la convención existente de `Task.dueDate`. Cargar categorías del usuario. | FR-042–044, FR-048–049 |
| `src/app/(app)/calendar/calendar-client.tsx`, `tests/unit/calendar-client.test.ts` | Rejilla mensual, navegación con botón «Hoy», selección de fecha, agenda, filtro de categorías, representación de tareas diferenciada, overflow `+N`, estado vacío y formulario de alta/edición/borrado de eventos; accesibilidad y responsive. Tests del comportamiento de selección, botón «Hoy», filtro y manejo de eventos. | FR-043–046, FR-050–055 |
| `src/components/app-shell.tsx` | Añadir «Calendario» a la navegación principal, incluido menú móvil, siguiendo el patrón de rutas activas existente. | FR-042, FR-053 |
| `src/app/(app)/dashboard/page.tsx`, tests de dashboard existentes o nuevos | Consultar eventos desde hoy hasta los siete días naturales locales siguientes; mostrar tarjeta «Próximos eventos», enlace a `/calendar` y estado vacío. | FR-052 |
| `docs/architecture.md`, `MEMORY.md` | Documentar entidad, ruta, semántica de fechas/minutos locales, migración y límites del sprint; actualizar el resumen/estado solo tras convergencia. | FR-042–FR-054 |

No se prevén cambios en `AGENTS.md` ni `docs/constitution.md`: las reglas actuales de SDD, autorización, fechas locales y test-first ya cubren esta funcionalidad. No se modificarán seed/categorías, OAuth, integración Google, variables de entorno ni otras rutas salvo el dashboard y la navegación indicados.

## Decisiones técnicas y límites

| Decisión | Alternativa descartada | Motivo / límite conocido |
| --- | --- | --- |
| `CalendarEvent.dateKey` como clave local y horas como minutos locales. | Guardar los eventos como timestamps UTC y derivar el día al renderizar. | Evita desplazamientos de fecha por zona del servidor y representa directamente el calendario civil del usuario. No se implementan eventos con conversión entre zonas. |
| Mes y día consultados en el servidor mediante parámetros validados `month` y `day`. | Cargar todo el histórico del usuario en el navegador o almacenar selección solo en estado local. | Limita las consultas y conserva el estado al recargar/compartir URL. Los parámetros inválidos se ignoran y se sustituyen por el mes/día actual del usuario. |
| Tareas por `dueDate` como datos derivados y de solo lectura. | Crear un segundo registro para convertir cada tarea en evento. | Evita duplicación y conflictos de sincronización; el calendario no modifica vencimiento, estado ni rachas. |
| Categorías compartidas entre eventos y tareas. | Crear tabla o taxonomía paralela para calendario. | Respeta la decisión aprobada y permite reutilizar colores. El filtro aplica a elementos categorizados y ofrece «sin categoría». |
| Horarios en minutos enteros, fin exclusivo; `endMinutes=1440` representa medianoche al final del mismo día. | Timestamps o texto horario sin validación estructural. | Permite ordenar y validar intervalos con reglas puras. Se rechaza `endMinutes <= startMinutes`; no hay cruce a otro día. |
| Rejilla y agenda propias con Tailwind/UI existentes. | Incorporar una librería de calendario. | Mantiene dependencias y patrones del proyecto sencillos; el coste de interacción queda acotado al mes y agenda diaria. |

## Casos límite y seguridad

Probar: lunes/domingos en la primera semana, meses de 28/29/30/31 días, años bisiestos, cruce de año, mes/día inválido en URL, botón «Hoy» desde otro mes/día, diferencia de zona entre usuario y servidor, rango UTC de tareas por fecha de vencimiento, eventos a las 00:00 y hasta 24:00, horario incompleto, fuera de rango, duración nula/negativa y cruce de medianoche; día con muchas entradas; día vacío; categoría sin asignar, ajena, inexistente o eliminada; evento inexistente/ajeno; doble submit; errores de validación conservando campos; tarea vencida y completada; próximos eventos justo dentro/fuera del límite de siete días.

Las acciones deben validar todos los datos aunque el cliente también los valide. El filtro de categoría es presentación, nunca autorización. La página consulta solo registros del usuario. Mutaciones exitosas revalidan `/calendar` y `/dashboard`; fallos no deben cambiar el estado persistido.

## Pruebas y gates

Implementar cada tarea en orden test-first. Los tests de calendario/dominio y acciones usan datos fijos, reloj/fecha explícitos y dobles; no conectan con Neon ni dependen de red. Ejecutar `npm run test` tras cada tarea. Para convergencia final ejecutar `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build` y `git diff --check`; revisar cobertura FR-042–FR-055.

La migración se crea y revisa localmente. No ejecutar `npm run db:deploy` contra producción como parte de los gates automatizados; antes de desplegar se deberá aplicar la migración en el entorno destino en un paso de despliegue autorizado y verificar que el cliente Prisma y la base estén sincronizados.

## Documentación de convergencia

Actualizar `docs/architecture.md` con la ruta `/calendar`, la entidad `CalendarEvent`, fechas/horas locales y límites; actualizar `MEMORY.md` con el calendario y estado de migración. No cambiar `AGENTS.md` ni la constitución. La convergencia debe confirmar cada requisito FR-042–FR-055 y distinguir resultados automatizados de verificación visual manual.
