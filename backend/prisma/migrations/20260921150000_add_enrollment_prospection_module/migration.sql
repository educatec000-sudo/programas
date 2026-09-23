-- CreateEnum
CREATE TYPE "EnrollmentDatasetStatus" AS ENUM ('RASCUNHO', 'OFICIAL', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "ProjectionRuleSetStatus" AS ENUM ('RASCUNHO', 'ATIVO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "ProjectionRunMode" AS ENUM ('OFICIAL', 'SIMULACAO');

-- CreateEnum
CREATE TYPE "ProjectionRunStatus" AS ENUM ('PROCESSANDO', 'CONCLUIDO', 'APROVADO', 'CANCELADO');

-- AlterEnum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ImportType' AND e.enumlabel = 'MATRICULAS'
  ) THEN
    ALTER TYPE "ImportType" ADD VALUE 'MATRICULAS';
  END IF;
END $$;

-- CreateTable
CREATE TABLE "EnrollmentStage" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "segment" TEXT NOT NULL,
  "orderIndex" INTEGER NOT NULL,
  "nextStageCode" TEXT,
  "isEntryStage" BOOLEAN NOT NULL DEFAULT false,
  "defaultCapacity" INTEGER NOT NULL DEFAULT 25,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnrollmentStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentDataset" (
  "id" TEXT NOT NULL,
  "referenceYear" INTEGER NOT NULL,
  "targetYear" INTEGER,
  "status" "EnrollmentDatasetStatus" NOT NULL DEFAULT 'RASCUNHO',
  "sourceFileName" TEXT NOT NULL,
  "sourceHash" TEXT,
  "notes" TEXT,
  "importedById" TEXT,
  "approvedById" TEXT,
  "importJobId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EnrollmentDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentRecord" (
  "id" TEXT NOT NULL,
  "datasetId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "referenceYear" INTEGER NOT NULL,
  "contextKey" TEXT NOT NULL,
  "classStageRaw" TEXT NOT NULL,
  "classLabel" TEXT NOT NULL,
  "shift" TEXT NOT NULL,
  "enrollmentStageRaw" TEXT NOT NULL,
  "stageCode" TEXT NOT NULL,
  "studentsCount" INTEGER NOT NULL,
  "isMultiStage" BOOLEAN NOT NULL DEFAULT false,
  "rawLine" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnrollmentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectionRuleSet" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "baseYear" INTEGER NOT NULL,
  "projectedYear" INTEGER NOT NULL,
  "status" "ProjectionRuleSetStatus" NOT NULL DEFAULT 'ATIVO',
  "notes" TEXT,
  "createdById" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectionRuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectionRuleItem" (
  "id" TEXT NOT NULL,
  "ruleSetId" TEXT NOT NULL,
  "stageCode" TEXT NOT NULL,
  "nextStageCode" TEXT,
  "promotionRate" DOUBLE PRECISION NOT NULL DEFAULT 90,
  "repetitionRate" DOUBLE PRECISION NOT NULL DEFAULT 10,
  "dropoutRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "entryRate" DOUBLE PRECISION NOT NULL DEFAULT 100,
  "capacityLimit" INTEGER,
  "roundingMode" TEXT NOT NULL DEFAULT 'ARREDONDAR',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectionRuleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolProjectionSetting" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "projectedYear" INTEGER NOT NULL,
  "entryStageCode" TEXT,
  "capacityOverrides" JSONB,
  "notes" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolProjectionSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectionRun" (
  "id" TEXT NOT NULL,
  "datasetId" TEXT NOT NULL,
  "ruleSetId" TEXT NOT NULL,
  "baseYear" INTEGER NOT NULL,
  "projectedYear" INTEGER NOT NULL,
  "mode" "ProjectionRunMode" NOT NULL DEFAULT 'OFICIAL',
  "status" "ProjectionRunStatus" NOT NULL DEFAULT 'PROCESSANDO',
  "notes" TEXT,
  "summary" JSONB,
  "createdById" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectionResult" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "stageCode" TEXT NOT NULL,
  "currentStudents" INTEGER NOT NULL DEFAULT 0,
  "projectedStudents" INTEGER NOT NULL DEFAULT 0,
  "currentClasses" INTEGER NOT NULL DEFAULT 0,
  "projectedClasses" INTEGER NOT NULL DEFAULT 0,
  "capacityLimit" INTEGER,
  "occupancyRate" DOUBLE PRECISION,
  "adjustmentApplied" INTEGER NOT NULL DEFAULT 0,
  "reasonJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectionResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentStage_code_key" ON "EnrollmentStage"("code");
CREATE INDEX "EnrollmentStage_orderIndex_idx" ON "EnrollmentStage"("orderIndex");
CREATE INDEX "EnrollmentStage_segment_active_idx" ON "EnrollmentStage"("segment", "active");

-- CreateIndex
CREATE INDEX "EnrollmentDataset_referenceYear_status_idx" ON "EnrollmentDataset"("referenceYear", "status");
CREATE INDEX "EnrollmentDataset_createdAt_idx" ON "EnrollmentDataset"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentRecord_datasetId_schoolId_classStageRaw_classLabel_shift_sta_key"
ON "EnrollmentRecord"("datasetId", "schoolId", "classStageRaw", "classLabel", "shift", "stageCode");
CREATE INDEX "EnrollmentRecord_datasetId_schoolId_idx" ON "EnrollmentRecord"("datasetId", "schoolId");
CREATE INDEX "EnrollmentRecord_referenceYear_stageCode_idx" ON "EnrollmentRecord"("referenceYear", "stageCode");

-- CreateIndex
CREATE INDEX "ProjectionRuleSet_baseYear_projectedYear_status_idx" ON "ProjectionRuleSet"("baseYear", "projectedYear", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectionRuleItem_ruleSetId_stageCode_key" ON "ProjectionRuleItem"("ruleSetId", "stageCode");
CREATE INDEX "ProjectionRuleItem_stageCode_active_idx" ON "ProjectionRuleItem"("stageCode", "active");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolProjectionSetting_schoolId_projectedYear_key" ON "SchoolProjectionSetting"("schoolId", "projectedYear");
CREATE INDEX "SchoolProjectionSetting_projectedYear_idx" ON "SchoolProjectionSetting"("projectedYear");

-- CreateIndex
CREATE INDEX "ProjectionRun_baseYear_projectedYear_mode_status_idx" ON "ProjectionRun"("baseYear", "projectedYear", "mode", "status");
CREATE INDEX "ProjectionRun_createdAt_idx" ON "ProjectionRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectionResult_runId_schoolId_stageCode_key" ON "ProjectionResult"("runId", "schoolId", "stageCode");
CREATE INDEX "ProjectionResult_schoolId_stageCode_idx" ON "ProjectionResult"("schoolId", "stageCode");

-- AddForeignKey
ALTER TABLE "EnrollmentRecord"
ADD CONSTRAINT "EnrollmentRecord_datasetId_fkey"
FOREIGN KEY ("datasetId") REFERENCES "EnrollmentDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EnrollmentRecord"
ADD CONSTRAINT "EnrollmentRecord_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectionRuleItem"
ADD CONSTRAINT "ProjectionRuleItem_ruleSetId_fkey"
FOREIGN KEY ("ruleSetId") REFERENCES "ProjectionRuleSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SchoolProjectionSetting"
ADD CONSTRAINT "SchoolProjectionSetting_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectionRun"
ADD CONSTRAINT "ProjectionRun_datasetId_fkey"
FOREIGN KEY ("datasetId") REFERENCES "EnrollmentDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectionRun"
ADD CONSTRAINT "ProjectionRun_ruleSetId_fkey"
FOREIGN KEY ("ruleSetId") REFERENCES "ProjectionRuleSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectionResult"
ADD CONSTRAINT "ProjectionResult_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "ProjectionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectionResult"
ADD CONSTRAINT "ProjectionResult_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
