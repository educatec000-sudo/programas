-- CreateEnum
CREATE TYPE "PactoClassSource" AS ENUM ('ADMINISTRADOR', 'ESCOLA');

-- CreateEnum
CREATE TYPE "PactoAssessmentCode" AS ENUM ('A0', 'A1', 'A2', 'A3');

-- CreateEnum
CREATE TYPE "PactoComponent" AS ENUM ('INICIAL', 'PORTUGUES', 'MATEMATICA');

-- CreateEnum
CREATE TYPE "PactoAssessmentStatus" AS ENUM ('RASCUNHO', 'ENVIADO', 'REABERTO');

-- CreateTable
CREATE TABLE "ProgramCollectionLink" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastAccessedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramCollectionLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PactoClass" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "shift" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "PactoClassSource" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PactoClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PactoAssessment" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "code" "PactoAssessmentCode" NOT NULL,
    "status" "PactoAssessmentStatus" NOT NULL DEFAULT 'RASCUNHO',
    "submittedAt" TIMESTAMP(3),
    "reopenedAt" TIMESTAMP(3),
    "reopenedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PactoAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PactoAssessmentComponent" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "component" "PactoComponent" NOT NULL,
    "enrolled" INTEGER NOT NULL,
    "evaluated" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PactoAssessmentComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PactoSkillResult" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PactoSkillResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramCollectionLink_tokenHash_key" ON "ProgramCollectionLink"("tokenHash");
CREATE INDEX "ProgramCollectionLink_programId_schoolId_revokedAt_idx" ON "ProgramCollectionLink"("programId", "schoolId", "revokedAt");
CREATE INDEX "ProgramCollectionLink_expiresAt_idx" ON "ProgramCollectionLink"("expiresAt");
CREATE UNIQUE INDEX "PactoClass_programId_schoolId_grade_shift_name_key" ON "PactoClass"("programId", "schoolId", "grade", "shift", "name");
CREATE INDEX "PactoClass_programId_schoolId_active_idx" ON "PactoClass"("programId", "schoolId", "active");
CREATE UNIQUE INDEX "PactoAssessment_classId_code_key" ON "PactoAssessment"("classId", "code");
CREATE INDEX "PactoAssessment_status_submittedAt_idx" ON "PactoAssessment"("status", "submittedAt");
CREATE UNIQUE INDEX "PactoAssessmentComponent_assessmentId_component_key" ON "PactoAssessmentComponent"("assessmentId", "component");
CREATE INDEX "PactoAssessmentComponent_component_idx" ON "PactoAssessmentComponent"("component");
CREATE UNIQUE INDEX "PactoSkillResult_componentId_skill_level_key" ON "PactoSkillResult"("componentId", "skill", "level");
CREATE INDEX "PactoSkillResult_skill_level_idx" ON "PactoSkillResult"("skill", "level");

-- AddForeignKey
ALTER TABLE "ProgramCollectionLink" ADD CONSTRAINT "ProgramCollectionLink_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramCollectionLink" ADD CONSTRAINT "ProgramCollectionLink_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramCollectionLink" ADD CONSTRAINT "ProgramCollectionLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PactoClass" ADD CONSTRAINT "PactoClass_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PactoClass" ADD CONSTRAINT "PactoClass_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PactoAssessment" ADD CONSTRAINT "PactoAssessment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "PactoClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PactoAssessment" ADD CONSTRAINT "PactoAssessment_reopenedById_fkey" FOREIGN KEY ("reopenedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PactoAssessmentComponent" ADD CONSTRAINT "PactoAssessmentComponent_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "PactoAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PactoSkillResult" ADD CONSTRAINT "PactoSkillResult_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "PactoAssessmentComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraints
ALTER TABLE "PactoClass" ADD CONSTRAINT "PactoClass_grade_check" CHECK ("grade" IN (1, 2));
ALTER TABLE "PactoClass" ADD CONSTRAINT "PactoClass_shift_check" CHECK ("shift" IN ('M', 'T'));
ALTER TABLE "PactoAssessmentComponent" ADD CONSTRAINT "PactoAssessmentComponent_enrolled_check" CHECK ("enrolled" >= 0);
ALTER TABLE "PactoAssessmentComponent" ADD CONSTRAINT "PactoAssessmentComponent_evaluated_check" CHECK ("evaluated" >= 0);
ALTER TABLE "PactoSkillResult" ADD CONSTRAINT "PactoSkillResult_count_check" CHECK ("count" >= 0);
