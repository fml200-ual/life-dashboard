import { describe, expect, it } from "vitest";

import {
  addMonthsToKey,
  getMonthGrid,
  getMonthRange,
  isValidDateKey,
  isValidMonthKey,
  navigateCalendarSelection,
  parseDateKey,
  parseMonthKey,
  selectCalendarDate,
  sortAgendaEvents,
  todayCalendarSelection,
} from "@/lib/calendar";

describe("date key parsing and validation", () => {
  it("parses valid local date keys without converting their day", () => {
    expect(parseDateKey("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseDateKey("0001-01-01")).toEqual({ year: 1, month: 1, day: 1 });
    expect(isValidDateKey("2026-10-15")).toBe(true);
  });

  it.each([
    "2023-02-29",
    "1900-02-29",
    "2026-04-31",
    "2026-13-01",
    "2026-00-10",
    "2026-01-00",
    "0000-01-01",
    "26-01-01",
    "2026-1-01",
    " 2026-01-01",
    "2026-01-01T00:00:00Z",
  ])("rejects invalid date key %s", (dateKey) => {
    expect(parseDateKey(dateKey)).toBeNull();
    expect(isValidDateKey(dateKey)).toBe(false);
  });

  it("strictly parses month keys and rejects impossible months", () => {
    expect(parseMonthKey("2026-12")).toEqual({ year: 2026, month: 12 });
    expect(isValidMonthKey("2026-01")).toBe(true);
    expect(parseMonthKey("2026-13")).toBeNull();
    expect(parseMonthKey("2026-1")).toBeNull();
    expect(parseMonthKey("0000-01")).toBeNull();
  });
});

describe("month range and navigation", () => {
  it("returns inclusive month boundaries and handles leap years", () => {
    expect(getMonthRange("2024-02")).toEqual({
      startDate: "2024-02-01",
      endDate: "2024-02-29",
    });
    expect(getMonthRange("2025-02")).toEqual({
      startDate: "2025-02-01",
      endDate: "2025-02-28",
    });
  });

  it("adds and subtracts months across year boundaries", () => {
    expect(addMonthsToKey("2026-12", 1)).toBe("2027-01");
    expect(addMonthsToKey("2026-01", -1)).toBe("2025-12");
    expect(addMonthsToKey("2024-01", 13)).toBe("2025-02");
    expect(() => addMonthsToKey("2026-01", 0.5)).toThrow(RangeError);
    expect(() => addMonthsToKey("9999-12", 1)).toThrow(RangeError);
    expect(() => getMonthRange("2026-13")).toThrow(TypeError);
  });

  it("rejects grids whose required filler days cannot fit a four-digit year key", () => {
    expect(() => getMonthGrid("9999-12")).toThrow(RangeError);
  });

  it("creates complete Monday-to-Sunday grids with four, five, or six rows", () => {
    const fourRows = getMonthGrid("2021-02");
    const fiveRows = getMonthGrid("2024-02");
    const sixRows = getMonthGrid("2020-08");

    expect(fourRows).toHaveLength(28);
    expect(fourRows[0]).toEqual({ dateKey: "2021-02-01", inCurrentMonth: true });
    expect(fourRows.at(-1)).toEqual({ dateKey: "2021-02-28", inCurrentMonth: true });

    expect(fiveRows).toHaveLength(35);
    expect(fiveRows[0]).toEqual({ dateKey: "2024-01-29", inCurrentMonth: false });
    expect(fiveRows.at(-1)).toEqual({ dateKey: "2024-03-03", inCurrentMonth: false });
    expect(fiveRows.find((day) => day.dateKey === "2024-02-29")?.inCurrentMonth).toBe(true);

    expect(sixRows).toHaveLength(42);
    expect(sixRows[0]).toEqual({ dateKey: "2020-07-27", inCurrentMonth: false });
    expect(sixRows.at(-1)).toEqual({ dateKey: "2020-09-06", inCurrentMonth: false });
  });

  it("supports navigating the grid's adjacent-month filler days", () => {
    expect(selectCalendarDate("2024-01-29")).toEqual({
      monthKey: "2024-01",
      selectedDate: "2024-01-29",
    });
  });
});

describe("calendar selection and Today navigation", () => {
  it("selects a day and follows the selected day when navigating months", () => {
    const selection = selectCalendarDate("2024-01-31");

    expect(navigateCalendarSelection(selection, 1)).toEqual({
      monthKey: "2024-02",
      selectedDate: "2024-02-29",
    });
    expect(navigateCalendarSelection(selection, -1)).toEqual({
      monthKey: "2023-12",
      selectedDate: "2023-12-31",
    });
  });

  it("returns the explicit local today as both selected day and visible month", () => {
    expect(todayCalendarSelection("2026-01-01")).toEqual({
      monthKey: "2026-01",
      selectedDate: "2026-01-01",
    });
  });

  it("rejects invalid selections and non-integer month navigation", () => {
    expect(() => selectCalendarDate("2026-02-30")).toThrow(TypeError);
    expect(() => navigateCalendarSelection(selectCalendarDate("2026-01-15"), 1.2)).toThrow(
      RangeError,
    );
  });
});

describe("agenda event ordering", () => {
  it("places all-day events first, then sorts timed events by start and id", () => {
    const events = [
      { id: "timed-late", allDay: false, startMinutes: 600 },
      { id: "all-day-z", allDay: true, startMinutes: null },
      { id: "timed-b", allDay: false, startMinutes: 540 },
      { id: "all-day-a", allDay: true, startMinutes: null },
      { id: "timed-a", allDay: false, startMinutes: 540 },
    ];

    expect(sortAgendaEvents(events).map(({ id }) => id)).toEqual([
      "all-day-a",
      "all-day-z",
      "timed-a",
      "timed-b",
      "timed-late",
    ]);
    expect(events[0].id).toBe("timed-late");
  });
});
