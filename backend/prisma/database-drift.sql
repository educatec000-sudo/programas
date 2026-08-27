-- AlterTable
ALTER TABLE "School" ADD COLUMN     "adminDependency" "AdminDependency",
ADD COLUMN     "municipality" TEXT NOT NULL,
ADD COLUMN     "situation" "SchoolSituation" NOT NULL DEFAULT 'ATIVA';

-- CreateIndex
CREATE INDEX "School_municipality_idx" ON "School"("municipality");

-- CreateIndex
CREATE INDEX "School_situation_deletedAt_idx" ON "School"("situation", "deletedAt");

