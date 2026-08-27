-- Estado explícito para importações em que apenas parte das linhas foi gravada.
ALTER TYPE "ImportStatus" ADD VALUE IF NOT EXISTS 'PARCIAL' AFTER 'IMPORTADO';

-- Índices para os filtros mais usados por ranking, resultados e resolução de metas.
CREATE INDEX "Result_programId_year_period_idx"
  ON "Result"("programId", "year", "period");
CREATE INDEX "Goal_programId_indicatorId_schoolId_year_period_idx"
  ON "Goal"("programId", "indicatorId", "schoolId", "year", "period");

-- Constraints de domínio: a API valida os mesmos limites, mas o banco também
-- deve rejeitar dados inválidos inseridos por scripts, seeds ou integrações.
ALTER TABLE "Role"
  ADD CONSTRAINT "Role_level_check" CHECK ("level" BETWEEN 1 AND 100);

ALTER TABLE "School"
  ADD CONSTRAINT "School_latitude_check" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "School_longitude_check" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "School_uf_check" CHECK ("uf" IS NULL OR "uf" ~ '^[A-Z]{2}$');

ALTER TABLE "Program"
  ADD CONSTRAINT "Program_year_check" CHECK ("year" BETWEEN 2000 AND 2100),
  ADD CONSTRAINT "Program_globalGoal_check" CHECK ("globalGoal" IS NULL OR "globalGoal" >= 0);

ALTER TABLE "Indicator"
  ADD CONSTRAINT "Indicator_weight_check" CHECK ("weight" >= 0),
  ADD CONSTRAINT "Indicator_defaultGoal_check" CHECK ("defaultGoal" IS NULL OR "defaultGoal" >= 0),
  ADD CONSTRAINT "Indicator_range_check" CHECK ("minValue" IS NULL OR "maxValue" IS NULL OR "minValue" <= "maxValue");

ALTER TABLE "ProgramIndicator"
  ADD CONSTRAINT "ProgramIndicator_weight_check" CHECK ("weight" IS NULL OR "weight" >= 0),
  ADD CONSTRAINT "ProgramIndicator_goal_check" CHECK ("goal" IS NULL OR "goal" >= 0);

ALTER TABLE "Result"
  ADD CONSTRAINT "Result_year_check" CHECK ("year" BETWEEN 2000 AND 2100);

ALTER TABLE "Goal"
  ADD CONSTRAINT "Goal_year_check" CHECK ("year" BETWEEN 2000 AND 2100),
  ADD CONSTRAINT "Goal_value_check" CHECK ("value" >= 0),
  ADD CONSTRAINT "Goal_scope_dimensions_check" CHECK (
    ("scope" <> 'GERAL' OR ("programId" IS NULL AND "schoolId" IS NULL AND "indicatorId" IS NULL))
    AND ("scope" <> 'PROGRAMA' OR "programId" IS NOT NULL)
    AND ("scope" <> 'ESCOLA' OR "schoolId" IS NOT NULL)
    AND ("scope" <> 'INDICADOR' OR "indicatorId" IS NOT NULL)
  );

ALTER TABLE "Evaluation"
  ADD CONSTRAINT "Evaluation_year_check" CHECK ("year" BETWEEN 2000 AND 2100),
  ADD CONSTRAINT "Evaluation_score_check" CHECK ("score" BETWEEN 0 AND 200),
  ADD CONSTRAINT "Evaluation_position_check" CHECK ("position" > 0),
  ADD CONSTRAINT "Evaluation_classification_check" CHECK ("classification" IN ('A', 'B', 'C', 'D', 'E'));
