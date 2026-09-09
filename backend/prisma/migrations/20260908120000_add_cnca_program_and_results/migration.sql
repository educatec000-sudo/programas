-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'CncaComponent'
          AND n.nspname = 'public'
    ) THEN
        CREATE TYPE "CncaComponent" AS ENUM (
            'ESCRITA',
            'LEITURA',
            'MATEMATICA',
            'FLUENCIA'
        );
    END IF;
END
$$;

-- CreateTable
CREATE TABLE "CncaSchoolResult" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "assessment" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "component" "CncaComponent" NOT NULL,
    "enrolled" INTEGER,
    "evaluated" INTEGER,
    "participationRate" DOUBLE PRECISION,
    "averageScore" DOUBLE PRECISION,
    "pcpm" DOUBLE PRECISION,
    "ppcpm" DOUBLE PRECISION,
    "accuracyRate" DOUBLE PRECISION,
    "fluentRate" DOUBLE PRECISION,
    "performanceLevels" JSONB,
    "skills" JSONB,
    "source" TEXT NOT NULL DEFAULT 'IMPORTACAO',
    "rawDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CncaSchoolResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CncaSchoolResult_programId_year_component_grade_idx" ON "CncaSchoolResult"("programId", "year", "component", "grade");

-- CreateIndex
CREATE INDEX "CncaSchoolResult_schoolId_idx" ON "CncaSchoolResult"("schoolId");

-- CreateIndex
CREATE INDEX "CncaSchoolResult_component_assessment_idx" ON "CncaSchoolResult"("component", "assessment");

-- CreateIndex
CREATE UNIQUE INDEX "CncaSchoolResult_programId_schoolId_year_assessment_grade_component_key" ON "CncaSchoolResult"("programId", "schoolId", "year", "assessment", "grade", "component");

-- AddForeignKey
ALTER TABLE "CncaSchoolResult" ADD CONSTRAINT "CncaSchoolResult_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CncaSchoolResult" ADD CONSTRAINT "CncaSchoolResult_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
