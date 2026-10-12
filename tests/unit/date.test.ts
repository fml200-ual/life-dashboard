import { describe, expect, it } from "vitest";

import {
  addDaysToKey,
  computeStreak,
  diffInDays,
  toDateKey,
  todayKey,
  utcMidnightFromDateKey,
} from "@/lib/date";

describe("toDateKey", () => {
  it("formatea el mismo instante según la zona horaria", () => {
    const instant = new Date("2026-01-01T00:30:00.000Z");

    expect(toDateKey(instant, "UTC")).toBe("2026-01-01");
    expect(toDateKey(instant, "America/New_York")).toBe("2025-12-31");
  });

  it("devuelve el formato YYYY-MM-DD", () => {
    expect(toDateKey(new Date(), "Europe/Madrid")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("utcMidnightFromDateKey", () => {
  it("produce medianoche UTC de la clave local", () => {
    expect(utcMidnightFromDateKey("2026-03-05").toISOString()).toBe(
      "2026-03-05T00:00:00.000Z",
    );
  });
});

describe("todayKey", () => {
  it("devuelve una clave de día válida", () => {
    expect(todayKey("Europe/Madrid")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("addDaysToKey", () => {
  it("suma y resta días cruzando meses y años", () => {
    expect(addDaysToKey("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2024-02-28", 1)).toBe("2024-02-29");
  });
});

describe("diffInDays", () => {
  it("calcula la diferencia en días entre claves", () => {
    expect(diffInDays("2026-01-01", "2026-01-01")).toBe(0);
    expect(diffInDays("2026-01-01", "2026-01-02")).toBe(1);
    expect(diffInDays("2025-12-31", "2026-01-01")).toBe(1);
    expect(diffInDays("2026-01-05", "2026-01-01")).toBe(-4);
  });
});

describe("computeStreak", () => {
  it("sin días devuelve ceros", () => {
    expect(computeStreak([], "2026-01-01")).toEqual({
      current: 0,
      longest: 0,
      lastDate: null,
    });
  });

  it("cuenta la racha actual si el último día es hoy", () => {
    expect(
      computeStreak(["2026-01-01", "2026-01-02", "2026-01-03"], "2026-01-03"),
    ).toEqual({ current: 3, longest: 3, lastDate: "2026-01-03" });
  });

  it("cuenta la racha actual si el último día fue ayer", () => {
    expect(
      computeStreak(["2026-01-01", "2026-01-02", "2026-01-03"], "2026-01-04"),
    ).toEqual({ current: 3, longest: 3, lastDate: "2026-01-03" });
  });

  it("no cuenta la racha actual si el último día es anterior a ayer", () => {
    expect(
      computeStreak(["2026-01-01", "2026-01-02", "2026-01-03"], "2026-01-05"),
    ).toEqual({ current: 0, longest: 3, lastDate: "2026-01-03" });
  });

  it("distingue la racha actual de la más larga", () => {
    expect(
      computeStreak(
        ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-10"],
        "2026-01-10",
      ),
    ).toEqual({ current: 1, longest: 3, lastDate: "2026-01-10" });
  });

  it("normaliza duplicados y orden", () => {
    expect(
      computeStreak(["2026-01-02", "2026-01-01", "2026-01-01"], "2026-01-02"),
    ).toEqual({ current: 2, longest: 2, lastDate: "2026-01-02" });
  });
});
