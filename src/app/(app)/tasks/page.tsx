import { TasksClient } from "./tasks-client";

import { requireUser } from "@/lib/auth";
import { todayKey } from "@/lib/date";
import { prisma } from "@/lib/db";

export default async function TasksPage() {
  const user = await requireUser();

  const [tasks, categories] = await Promise.all([
    prisma.task.findMany({
      where: { userId: user.id },
      orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "asc" }],
    }),
    prisma.category.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <TasksClient
      initialTasks={tasks}
      categories={categories}
      today={todayKey(user.timezone)}
    />
  );
}