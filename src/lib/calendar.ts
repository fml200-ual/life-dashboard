/**
 * Helpers de dominio para el calendario. Las claves son fechas civiles locales
 * YYYY-MM-DD; UTC se usa únicamente como aritmética gregoriana, nunca para
 * interpretar una fecha/hora del usuario.
 */

export type ParsedDateKey = {
  year: number;
  month: number;
  day: number;
};

export type ParsedMonthKey = {
  year: number;
  month: number;
};

export type CalendarDay = {
  dateKey: string;
  inCurrentMonth: boolean;
};

export type CalendarSelection = {
  monthKey: string;
  selectedDate: string;
};

export type AgendaEvent = {
  id: string;
  allDay: boolean;
  startMinutes: number | null;
};

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY_PATTERN = /^(\d{4})-(\d{2})$/;

export function parseDateKey(dateKey: string): ParsedDateKey | null {
  const match = DATE_KEY_PATTERN.exec(dateKey);

  if (!match) return null;

  const [, yearPart, monthPart, dayPart] = match;
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    return null;
  }

  return { year, month, day };
}

export function isValidDateKey(dateKey: string): boolean {
  return parseDateKey(dateKey) !== null;
}

export function parseMonthKey(monthKey: string): ParsedMonthKey | null {
  const match = MONTH_KEY_PATTERN.exec(monthKey);

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (year < 1 || month < 1 || month > 12) return null;

  return { year, month };
}

export function isValidMonthKey(monthKey: string): boolean {
  return parseMonthKey(monthKey) !== null;
}

/** Devuelve el primer y último día del mes, ambos incluidos. */
export function getMonthRange(monthKey: string): {
  startDate: string;
  endDate: string;
} {
  const parsed = requireMonthKey(monthKey);

  return {
    startDate: `${monthKey}-01`,
    endDate: `${monthKey}-${pad2(daysInMonth(parsed.year, parsed.month))}`,
  };
}

/** Navega meses usando una cantidad entera (positiva o negativa). */
export function addMonthsToKey(monthKey: string, amount: number): string {
  const parsed = requireMonthKey(monthKey);

  if (!Number.isSafeInteger(amount)) {
    throw new RangeError("La cantidad de meses debe ser un entero seguro.");
  }

  const index = parsed.year * 12 + parsed.month - 1 + amount;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;

  if (year < 1 || year > 9999) {
    throw new RangeError("La navegación excede el rango de años admitido.");
  }

  return `${String(year).padStart(4, "0")}-${pad2(month)}`;
}

/**
 * Genera semanas completas de lunes a domingo. Según la alineación del mes,
 * devuelve cuatro, cinco o seis filas; los días adyacentes siguen siendo
 * fechas válidas y seleccionables.
 */
export function getMonthGrid(monthKey: string): CalendarDay[] {
  const { year, month } = requireMonthKey(monthKey);
  const firstDay = createUtcDate(year, month, 1);
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
  const count = daysInMonth(year, month);
  const rows = Math.ceil((mondayOffset + count) / 7);
  const gridStart = createUtcDate(year, month, 1 - mondayOffset);

  return Array.from({ length: rows * 7 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    const dateKey = formatUtcDateKey(date);

    return {
      dateKey,
      inCurrentMonth: date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month,
    };
  });
}

/** Selecciona una fecha válida y muestra el mes al que pertenece. */
export function selectCalendarDate(dateKey: string): CalendarSelection {
  const parsed = requireDateKey(dateKey);

  return {
    monthKey: `${String(parsed.year).padStart(4, "0")}-${pad2(parsed.month)}`,
    selectedDate: dateKey,
  };
}

/**
 * Navega el mes visible y conserva el día seleccionado, ajustándolo al último
 * día del mes de destino cuando ese número de día no existe (p. ej. 31 → 29).
 */
export function navigateCalendarSelection(
  selection: CalendarSelection,
  amount: number,
): CalendarSelection {
  const selected = requireDateKey(selection.selectedDate);
  const monthKey = addMonthsToKey(selection.monthKey, amount);
  const targetMonth = requireMonthKey(monthKey);
  const day = Math.min(selected.day, daysInMonth(targetMonth.year, targetMonth.month));

  return {
    monthKey,
    selectedDate: `${monthKey}-${pad2(day)}`,
  };
}

/** El caller aporta explícitamente el hoy local calculado con su zona horaria. */
export function todayCalendarSelection(todayDateKey: string): CalendarSelection {
  return selectCalendarDate(todayDateKey);
}

/** Ordena sin mutar: día completo primero, luego hora de inicio e ID. */
export function sortAgendaEvents<T extends AgendaEvent>(events: readonly T[]): T[] {
  return [...events].sort((left, right) => {
    if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;

    if (!left.allDay) {
      const leftStart = left.startMinutes ?? Number.POSITIVE_INFINITY;
      const rightStart = right.startMinutes ?? Number.POSITIVE_INFINITY;
      if (leftStart !== rightStart) return leftStart - rightStart;
    }

    return compareStrings(left.id, right.id);
  });
}

function requireDateKey(dateKey: string): ParsedDateKey {
  const parsed = parseDateKey(dateKey);
  if (!parsed) throw new TypeError(`Clave de fecha local inválida: ${dateKey}`);
  return parsed;
}

function requireMonthKey(monthKey: string): ParsedMonthKey {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) throw new TypeError(`Clave de mes inválida: ${monthKey}`);
  return parsed;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function createUtcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function formatUtcDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9999) {
    throw new RangeError("La cuadrícula excede el rango de claves YYYY-MM-DD admitido.");
  }

  return `${String(year).padStart(4, "0")}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate(),
  )}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
