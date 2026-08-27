-- Migração de compatibilidade para bancos que registraram
-- 20260826133122_sync_school_fields como aplicada usando uma versão antiga do
-- arquivo. Todas as operações são idempotentes e não removem dados.
ALTER TABLE "School"
  ADD COLUMN IF NOT EXISTS "addressComplement" TEXT,
  ADD COLUMN IF NOT EXISTS "addressNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "cep" TEXT,
  ADD COLUMN IF NOT EXISTS "schoolType" TEXT,
  ADD COLUMN IF NOT EXISTS "uf" TEXT;

ALTER TABLE "School" ALTER COLUMN "inep" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "School_district_idx" ON "School"("district");

-- Se a migration de hardening falhou depois de executar suas primeiras
-- instruções, PostgreSQL pode ter preservado índices/constraint parciais.
-- Remova somente quando não existir uma execução concluída do hardening, para
-- que a tentativa seguinte possa recriá-los sem erro de objeto duplicado.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "_prisma_migrations"
    WHERE migration_name = '20260826190000_harden_data_integrity'
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL
  ) THEN
    DROP INDEX IF EXISTS "Result_programId_year_period_idx";
    DROP INDEX IF EXISTS "Goal_programId_indicatorId_schoolId_year_period_idx";
    ALTER TABLE "Role" DROP CONSTRAINT IF EXISTS "Role_level_check";
  END IF;
END $$;
