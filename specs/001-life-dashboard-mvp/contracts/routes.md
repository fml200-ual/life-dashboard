# Contracts — Rutas HTTP

Rutas de la aplicación (Next.js App Router). "Privada" = requiere sesión válida;
la comprobación real ocurre en servidor (layout/acciones), `proxy.ts` solo
redirige de forma optimista.

| Ruta          | Método | Acceso  | Render      | Descripción                                   | Requisitos |
| ------------- | ------ | ------- | ----------- | --------------------------------------------- | ---------- |
| `/`           | GET    | pública | dinámico    | Redirige a `/login` o `/dashboard`            | FR-001     |
| `/login`      | GET    | pública | (estático)  | Formulario de acceso                          | FR-001,002 |
| `/login`      | POST*  | pública | —           | Envía Server Action `loginAction`             | FR-002,004 |
| `/dashboard`  | GET    | privada | dinámico    | Resumen del día, rachas y próximos vencimientos | FR-006    |
| `/tasks`      | GET    | privada | dinámico    | Listado y gestión de tareas/categorías        | FR-005,006 |
| `/pomodoro`   | GET    | privada | dinámico    | Temporizador y estadísticas                   | FR-007     |
| `/notes`      | GET    | privada | dinámico    | Notas con autoguardado                        | FR-008,013 |
| `/settings`   | GET    | privada | dinámico    | Preferencias                                  | FR-009,014 |
| `/api/health` | GET    | pública | dinámico (`force-dynamic`) | `{ "status": "ok" }` si la BD responde | FR-012 |

\* El `POST /login` no es un route handler: es una **Server Action** invocada
desde el formulario (ver [`actions.md`](./actions.md)). Su fallo actual (500) se
trata como *bug*, no como contrato.

## Comportamiento de redirección (`proxy.ts`)

- Sin cookie de sesión y ruta no pública → `302` a `/login`.
- Con cookie y `pathname === "/login"` → `302` a `/dashboard`.
- El matcher excluye `_next/static`, `_next/image`, `favicon.ico`, `robots.txt`
  y assets (imágenes/fuentes por extensión).

## Respuestas de `/api/health`

```json
{ "status": "ok" }
```

- `200` con la base disponible (< 2 s, SC-006).
- `force-dynamic`: nunca se cachea.
