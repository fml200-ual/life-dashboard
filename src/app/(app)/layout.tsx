import { AppShell } from "@/components/app-shell";
import { ThemeSync } from "@/components/theme-sync";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  const preferences = await prisma.userPreferences.findUnique({
    where: { userId: user.id },
  });

  return (
    <AppShell userName={user.name ?? user.email} userEmail={user.email}>
      <ThemeSync theme={preferences?.theme ?? "SYSTEM"} />
      {children}
    </AppShell>
  );
}
