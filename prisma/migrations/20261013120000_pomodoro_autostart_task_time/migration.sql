-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "accumulatedSeconds" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PomodoroSession" ADD COLUMN     "actualSeconds" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN     "autoAdvance" BOOLEAN NOT NULL DEFAULT false;
