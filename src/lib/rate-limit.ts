// Limitador de peticiones en memoria (mejor esfuerzo).
//
// Nota: en un despliegue serverless cada instancia tiene su propia memoria,
// por lo que esto mitiga fuerza bruta pero no la bloquea de forma global.
// Para producción con más garantías, sustituir por un almacén compartido
// (p. ej. Upstash Redis) manteniendo esta misma interfaz.

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

export type RateLimitResult = {
  ok: boolean;
  retryAfterSeconds: number;
};

export function checkRateLimit(
  key: string,
  max = 5,
  windowMs = 15 * 60 * 1000,
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= max) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  entry.count += 1;
  return { ok: true, retryAfterSeconds: 0 };
}
