-- CreateEnum
CREATE TYPE "ParcCycle" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateTable
CREATE TABLE "ParcSchoolResult" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "year" INTEGER NOT NULL DEFAULT 2026,
    "grade" TEXT NOT NULL DEFAULT '2º Ano',
    "assessment" TEXT NOT NULL DEFAULT 'Fluência Leitora',
    "cycle" "ParcCycle" NOT NULL DEFAULT 'ENTRADA',
    "enrolled" INTEGER,
    "evaluated" INTEGER,
    "participationRate" DOUBLE PRECISION,
    "preReaderTotal" DOUBLE PRECISION,
    "preReaderLevel1" DOUBLE PRECISION,
    "preReaderLevel2" DOUBLE PRECISION,
    "preReaderLevel3" DOUBLE PRECISION,
    "preReaderLevel4" DOUBLE PRECISION,
    "beginnerReader" DOUBLE PRECISION,
    "fluentReader" DOUBLE PRECISION,
    "rawCounts" JSONB,
    "rawDetails" JSONB,
    "source" TEXT NOT NULL DEFAULT 'IMPORTACAO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParcSchoolResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParcSchoolResult_programId_year_cycle_idx" ON "ParcSchoolResult"("programId", "year", "cycle");

-- CreateIndex
CREATE INDEX "ParcSchoolResult_schoolId_idx" ON "ParcSchoolResult"("schoolId");

-- CreateIndex
CREATE INDEX "ParcSchoolResult_cycle_idx" ON "ParcSchoolResult"("cycle");

-- CreateIndex
CREATE UNIQUE INDEX "ParcSchoolResult_programId_schoolId_year_grade_assessment_cycle_key" ON "ParcSchoolResult"("programId", "schoolId", "year", "grade", "assessment", "cycle");

-- AddForeignKey
ALTER TABLE "ParcSchoolResult" ADD CONSTRAINT "ParcSchoolResult_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcSchoolResult" ADD CONSTRAINT "ParcSchoolResult_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
