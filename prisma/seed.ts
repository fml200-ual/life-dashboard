import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está definida. Revisa tu archivo .env");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DEFAULT_CATEGORIES = [
  { name: "Estudios", color: "#6366f1" },
  { name: "Trabajo", color: "#0ea5e9" },
  { name: "Personal", color: "#f59e0b" },
  { name: "Salud", color: "#10b981" },
];

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Define ADMIN_EMAIL y ADMIN_PASSWORD en .env antes de ejecutar el seed.",
    );
  }

  const passwordHash = await hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      email,
      name: process.env.ADMIN_NAME?.trim() || "Usuario",
      passwordHash,
      timezone: process.env.ADMIN_TIMEZONE?.trim() || "Europe/Madrid",
      preferences: { create: {} },
    },
  });

  for (const category of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { userId_name: { userId: user.id, name: category.name } },
      update: { color: category.color },
      create: { userId: user.id, name: category.name, color: category.color },
    });
  }

  console.log(`Usuario autorizado listo: ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
