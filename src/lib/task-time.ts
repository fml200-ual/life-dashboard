function formatUnit(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function formatTaskTime(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.floor(totalSeconds))
    : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) {
    parts.push(formatUnit(hours, "hora", "horas"));
  }
  if (minutes > 0) {
    parts.push(formatUnit(minutes, "minuto", "minutos"));
  }
  if (seconds > 0) {
    parts.push(formatUnit(seconds, "segundo", "segundos"));
  }

  return parts.length > 0 ? parts.join(" ") : "0 segundos";
}
