import { describe, expect, it } from "vitest";

import { formatTaskTime } from "@/lib/task-time";

describe("formatTaskTime", () => {
  it("shows an explicit zero duration", () => {
    expect(formatTaskTime(0)).toBe("0 segundos");
  });

  it("truncates fractional seconds and formats durations below a minute", () => {
    expect(formatTaskTime(0.9)).toBe("0 segundos");
    expect(formatTaskTime(1.9)).toBe("1 segundo");
    expect(formatTaskTime(59)).toBe("59 segundos");
  });

  it("uses singular and plural units for minute and sub-hour durations", () => {
    expect(formatTaskTime(60)).toBe("1 minuto");
    expect(formatTaskTime(61)).toBe("1 minuto 1 segundo");
    expect(formatTaskTime(3599)).toBe("59 minutos 59 segundos");
  });

  it("formats hours and retains the remaining minutes and seconds", () => {
    expect(formatTaskTime(3600)).toBe("1 hora");
    expect(formatTaskTime(3661)).toBe("1 hora 1 minuto 1 segundo");
    expect(formatTaskTime(7322)).toBe("2 horas 2 minutos 2 segundos");
  });

  it("clamps negative durations to an explicit zero", () => {
    expect(formatTaskTime(-5)).toBe("0 segundos");
  });
});
