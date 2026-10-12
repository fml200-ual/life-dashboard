"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validations";

export type LoginState = { error?: string };

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const { email, password } = parsed.data;

  const headerStore = await headers();
  const ip =
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconocida";
  const limit = checkRateLimit(`login:${ip}:${email}`);

  if (!limit.ok) {
    return {
      error: `Demasiados intentos. Vuelve a intentarlo en ${limit.retryAfterSeconds} s.`,
    };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;

  if (!user || !valid) {
    return { error: "Credenciales no válidas." };
  }

  await createSession(user.id, headerStore.get("user-agent"));
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}
