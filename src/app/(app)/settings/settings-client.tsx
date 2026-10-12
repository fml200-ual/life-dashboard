"use client";

import { useActionState } from "react";

import {
  updateAppearanceAction,
  updatePomodoroSettingsAction,
  type SettingsResult,
} from "@/app/actions/settings";
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from "@/components/ui";

type Prefs = {
  theme: "LIGHT" | "DARK" | "SYSTEM";
  timezone: string;
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
  dailyPomodoroGoal: number;
  notificationsEnabled: boolean;
};

const initialResult: SettingsResult = { ok: true };

function ResultMessage({ state }: { state: SettingsResult }) {
  if (!state.ok) {
    return (
      <p
        role="alert"
        className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {state.error}
      </p>
    );
  }

  if (state.message) {
    return (
      <p className="rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        {state.message}
      </p>
    );
  }

  return null;
}

export function SettingsClient({
  user,
  prefs,
  timeZones,
}: {
  user: { name: string; email: string };
  prefs: Prefs;
  timeZones: string[];
}) {
  const [appearance, appearanceAction, appearancePending] = useActionState(
    updateAppearanceAction,
    initialResult,
  );
  const [pomodoro, pomodoroAction, pomodoroPending] = useActionState(
    updatePomodoroSettingsAction,
    initialResult,
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cuenta y preferencias de la aplicación.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cuenta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="account-name">Nombre</Label>
              <Input id="account-name" value={user.name} readOnly disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-email">Correo</Label>
              <Input id="account-email" value={user.email} readOnly disabled />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Integraciones (p. ej. Gmail) llegarán en una fase posterior.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Apariencia y zona horaria</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={appearanceAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="theme">Tema</Label>
                <Select id="theme" name="theme" defaultValue={prefs.theme}>
                  <option value="SYSTEM">Sistema</option>
                  <option value="LIGHT">Claro</option>
                  <option value="DARK">Oscuro</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timezone">Zona horaria</Label>
                <Select id="timezone" name="timezone" defaultValue={prefs.timezone}>
                  {timeZones.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="submit" disabled={appearancePending}>
                {appearancePending ? "Guardando…" : "Guardar"}
              </Button>
              <ResultMessage state={appearance} />
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pomodoro</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={pomodoroAction} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="workMinutes">Concentración (min)</Label>
                <Input
                  id="workMinutes"
                  name="workMinutes"
                  type="number"
                  min={1}
                  max={180}
                  defaultValue={prefs.workMinutes}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shortBreakMinutes">Descanso corto (min)</Label>
                <Input
                  id="shortBreakMinutes"
                  name="shortBreakMinutes"
                  type="number"
                  min={1}
                  max={60}
                  defaultValue={prefs.shortBreakMinutes}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="longBreakMinutes">Descanso largo (min)</Label>
                <Input
                  id="longBreakMinutes"
                  name="longBreakMinutes"
                  type="number"
                  min={1}
                  max={120}
                  defaultValue={prefs.longBreakMinutes}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="longBreakInterval">
                  Descanso largo cada (sesiones)
                </Label>
                <Input
                  id="longBreakInterval"
                  name="longBreakInterval"
                  type="number"
                  min={1}
                  max={12}
                  defaultValue={prefs.longBreakInterval}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dailyPomodoroGoal">Objetivo diario</Label>
                <Input
                  id="dailyPomodoroGoal"
                  name="dailyPomodoroGoal"
                  type="number"
                  min={1}
                  max={50}
                  defaultValue={prefs.dailyPomodoroGoal}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="notificationsEnabled"
                defaultChecked={prefs.notificationsEnabled}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              Notificaciones del temporizador
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="submit" disabled={pomodoroPending}>
                {pomodoroPending ? "Guardando…" : "Guardar"}
              </Button>
              <ResultMessage state={pomodoro} />
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}