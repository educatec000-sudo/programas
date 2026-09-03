-- Define, por turma, quais avaliações aparecem no link público.
-- Turmas existentes mantêm A0-A3 habilitadas até que a administração as ajuste.
ALTER TABLE "PactoClass"
ADD COLUMN "enabledAssessments" "PactoAssessmentCode"[] NOT NULL
DEFAULT ARRAY['A0', 'A1', 'A2', 'A3']::"PactoAssessmentCode"[];

-- Quando já existem avaliações gravadas, elas definem inicialmente o que a
-- escola verá. Turmas ainda sem coleta permanecem com A0-A3 disponíveis para
-- que a primeira avaliação possa ser iniciada.
UPDATE "PactoClass" AS turma
   SET "enabledAssessments" = existentes.codigos
  FROM (
      SELECT "classId", ARRAY_AGG("code" ORDER BY "code") AS codigos
        FROM "PactoAssessment"
       GROUP BY "classId"
  ) AS existentes
 WHERE turma."id" = existentes."classId";

ALTER TABLE "PactoClass"
ADD CONSTRAINT "PactoClass_enabled_assessments_check"
CHECK (cardinality("enabledAssessments") BETWEEN 1 AND 4);
