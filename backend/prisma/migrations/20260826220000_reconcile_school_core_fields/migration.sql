-- Reconcilia bancos antigos que registraram a migration inicial como aplicada,
-- mas cuja tabela School não recebeu todos os campos obrigatórios.
-- As colunas são criadas primeiro como opcionais para preservar linhas antigas.
ALTER TABLE "School"
  ADD COLUMN IF NOT EXISTS "adminDependency" "AdminDependency",
  ADD COLUMN IF NOT EXISTS "municipality" TEXT,
  ADD COLUMN IF NOT EXISTS "situation" "SchoolSituation";

-- Preenchimento seguro para eventuais registros legados. Novos registros
-- continuam obrigados a informar municipality pela aplicação/Prisma.
UPDATE "School"
SET "municipality" = 'Benevides'
WHERE "municipality" IS NULL OR BTRIM("municipality") = '';

UPDATE "School"
SET "situation" = 'ATIVA'
WHERE "situation" IS NULL;

ALTER TABLE "School"
  ALTER COLUMN "municipality" SET NOT NULL,
  ALTER COLUMN "situation" SET DEFAULT 'ATIVA',
  ALTER COLUMN "situation" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "School_municipality_idx"
  ON "School"("municipality");

CREATE INDEX IF NOT EXISTS "School_situation_deletedAt_idx"
  ON "School"("situation", "deletedAt");
