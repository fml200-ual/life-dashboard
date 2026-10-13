import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const h = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireUser: vi.fn(),
  upsert: vi.fn(),
  findUnique: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: h.revalidatePath,
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: h.getCurrentUser,
  requireUser: h.requireUser,
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    userPreferences: {
      findUnique: h.findUnique,
      upsert: h.upsert,
    },
  },
}));

import { updatePomodoroSettingsAction } from "@/app/actions/settings";
import SettingsPage from "@/app/(app)/settings/page";

const user = { id: "user-1", name: "Ada", email: "ada@example.com", timezone: "UTC" };

function settingsForm(autoAdvance?: "on") {
  const formData = new FormData();
  formData.set("workMinutes", "25");
  formData.set("shortBreakMinutes", "5");
  formData.set("longBreakMinutes", "15");
  formData.set("longBreakInterval", "4");
  formData.set("dailyPomodoroGoal", "8");
  formData.set("notificationsEnabled", "on");
  if (autoAdvance) formData.set("autoAdvance", autoAdvance);
  return formData;
}

function upsertData(callIndex = 0) {
  return h.upsert.mock.calls[callIndex][0] as {
    update: Record<string, unknown>;
    create: Record<string, unknown>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getCurrentUser.mockResolvedValue(user);
  h.requireUser.mockResolvedValue(user);
  h.upsert.mockResolvedValue({});
});

describe("updatePomodoroSettingsAction autoAdvance", () => {
  it("persists true when the checkbox is marked", async () => {
    const result = await updatePomodoroSettingsAction({ ok: true }, settingsForm("on"));

    expect(result.ok).toBe(true);
    expect(upsertData().update.autoAdvance).toBe(true);
    expect(upsertData().create.autoAdvance).toBe(true);
  });

  it("persists false when the checkbox is absent, including for existing preferences", async () => {
    const result = await updatePomodoroSettingsAction({ ok: true }, settingsForm());

    expect(result.ok).toBe(true);
    expect(upsertData().update.autoAdvance).toBe(false);
    expect(upsertData().create.autoAdvance).toBe(false);
    expect(h.revalidatePath.mock.calls).toEqual([
      ["/settings"],
      ["/pomodoro"],
      ["/dashboard"],
    ]);
  });
});

describe("SettingsPage autoAdvance fallback", () => {
  it("shows auto-advance as off when the user has no preference row", async () => {
    h.findUnique.mockResolvedValue(null);

    const element = await SettingsPage();

    expect(h.findUnique).toHaveBeenCalledWith({ where: { userId: user.id } });
    expect(element.props.prefs.autoAdvance).toBe(false);
    expect(renderToStaticMarkup(element)).toContain('name="autoAdvance"');
    expect(renderToStaticMarkup(element)).not.toMatch(/name="autoAdvance"[^>]*checked/);
  });

  it("preserves the stored value for existing preferences", async () => {
    h.findUnique.mockResolvedValue({ autoAdvance: true });

    const element = await SettingsPage();

    expect(element.props.prefs.autoAdvance).toBe(true);
    expect(renderToStaticMarkup(element)).toMatch(/name="autoAdvance"[^>]*checked/);
  });
});
