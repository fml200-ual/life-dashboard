import { SettingsClient } from "./settings-client";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function listTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["Europe/Madrid", "UTC"];
  }
}

export default async function SettingsPage() {
  const user = await requireUser();

  const preferences = await prisma.userPreferences.findUnique({
    where: { userId: user.id },
  });

  return (
    <SettingsClient
      user={{ name: user.name ?? "", email: user.email }}
      prefs={{
        theme: preferences?.theme ?? "SYSTEM",
        timezone: user.timezone,
        workMinutes: preferences?.workMinutes ?? 25,
        shortBreakMinutes: preferences?.shortBreakMinutes ?? 5,
        longBreakMinutes: preferences?.longBreakMinutes ?? 15,
        longBreakInterval: preferences?.longBreakInterval ?? 4,
        dailyPomodoroGoal: preferences?.dailyPomodoroGoal ?? 8,
        notificationsEnabled: preferences?.notificationsEnabled ?? true,
        autoAdvance: preferences?.autoAdvance ?? false,
      }}
      timeZones={listTimeZones()}
    />
  );
}
