-- CreateEnum
CREATE TYPE "SispaeApplicationType" AS ENUM ('SIMULADO', 'AVALIACAO_OFICIAL');

-- CreateEnum
CREATE TYPE "SispaeApplicationStatus" AS ENUM ('PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'PUBLICADA');

-- CreateEnum
CREATE TYPE "SispaeComponent" AS ENUM ('LINGUA_PORTUGUESA', 'MATEMATICA', 'CIENCIAS_HUMANAS', 'CIENCIAS_NATUREZA', 'PRODUCAO_TEXTUAL', 'OUTRO');

-- CreateTable
CREATE TABLE "SispaeApplication" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SispaeApplicationType" NOT NULL DEFAULT 'SIMULADO',
    "year" INTEGER NOT NULL DEFAULT 2026,
    "stage" TEXT,
    "description" TEXT,
    "status" "SispaeApplicationStatus" NOT NULL DEFAULT 'PUBLICADA',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SispaeApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SispaeSchoolResult" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "year" INTEGER NOT NULL DEFAULT 2026,
    "grade" TEXT NOT NULL DEFAULT '2º Ano',
    "component" "SispaeComponent" NOT NULL DEFAULT 'LINGUA_PORTUGUESA',
    "enrolled" INTEGER,
    "evaluated" INTEGER,
    "participationRate" DOUBLE PRECISION,
    "averageScore" DOUBLE PRECISION,
    "performanceLevels" JSONB,
    "skills" JSONB,
    "source" TEXT NOT NULL DEFAULT 'IMPORTACAO',
    "rawDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SispaeSchoolResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SispaeApplication_programId_type_year_idx" ON "SispaeApplication"("programId", "type", "year");

-- CreateIndex
CREATE UNIQUE INDEX "SispaeApplication_programId_name_year_key" ON "SispaeApplication"("programId", "name", "year");

-- CreateIndex
CREATE INDEX "SispaeSchoolResult_programId_applicationId_component_idx" ON "SispaeSchoolResult"("programId", "applicationId", "component");

-- CreateIndex
CREATE INDEX "SispaeSchoolResult_schoolId_idx" ON "SispaeSchoolResult"("schoolId");

-- CreateIndex
CREATE INDEX "SispaeSchoolResult_applicationId_idx" ON "SispaeSchoolResult"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "SispaeSchoolResult_programId_applicationId_schoolId_grade_component_key" ON "SispaeSchoolResult"("programId", "applicationId", "schoolId", "grade", "component");

-- AddForeignKey
ALTER TABLE "SispaeApplication" ADD CONSTRAINT "SispaeApplication_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SispaeSchoolResult" ADD CONSTRAINT "SispaeSchoolResult_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SispaeSchoolResult" ADD CONSTRAINT "SispaeSchoolResult_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "SispaeApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SispaeSchoolResult" ADD CONSTRAINT "SispaeSchoolResult_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
