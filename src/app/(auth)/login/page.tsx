import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Iniciar sesión",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            LD
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Life Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acceso restringido a la cuenta autorizada.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
