// Utilidades de fecha y cálculo de rachas.
//
// Las fechas "de día" se manejan siempre como cadenas locales "YYYY-MM-DD"
// para evitar que al convertir a UTC se desplace el día.

export function toDateKey(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}

/**
 * Convierte una clave "YYYY-MM-DD" a un Date guardado como medianoche UTC.
 * Así se conserva el mismo día al leerlo con getUTCFullYear/Month/Date,
 * sin depender de la zona horaria del servidor.
 */
export function utcMidnightFromDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function todayKey(timeZone: string): string {
  return toDateKey(new Date(), timeZone);
}

export function addDaysToKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

export function diffInDays(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);

  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

export type StreakSummary = {
  current: number;
  longest: number;
  lastDate: string | null;
};

/**
 * Calcula la racha actual y la más larga a partir de días con actividad.
 * `days` son claves "YYYY-MM-DD" en cualquier orden; se normalizan aquí.
 * La racha actual cuenta solo si el último día es hoy o ayer.
 */
export function computeStreak(days: string[], today: string): StreakSummary {
  const unique = Array.from(new Set(days)).sort();

  if (unique.length === 0) {
    return { current: 0, longest: 0, lastDate: null };
  }

  let longest = 1;
  let run = 1;

  for (let i = 1; i < unique.length; i += 1) {
    if (diffInDays(unique[i - 1], unique[i]) === 1) {
      run += 1;
    } else {
      run = 1;
    }

    longest = Math.max(longest, run);
  }

  const lastDate = unique[unique.length - 1];
  const gapToToday = diffInDays(lastDate, today);

  let current = 0;

  if (gapToToday === 0 || gapToToday === 1) {
    current = 1;

    for (let i = unique.length - 1; i > 0; i -= 1) {
      if (diffInDays(unique[i - 1], unique[i]) === 1) {
        current += 1;
      } else {
        break;
      }
    }
  }

  return { current, longest, lastDate };
}
