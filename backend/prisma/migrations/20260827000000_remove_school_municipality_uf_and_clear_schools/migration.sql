-- Esta migration atende à decisão operacional de trabalhar com um único
-- território: município e UF deixam de existir no cadastro de escolas.
-- Também limpa permanentemente todas as escolas para permitir uma nova
-- importação controlada da planilha oficial.

-- Registros sem FK para School precisam ser removidos explicitamente.
DELETE FROM "Document"
WHERE "entity" = 'School';

DELETE FROM "AuditLog"
WHERE "entity" = 'School';

-- Histórico das importações de escolas (ImportError é removido por CASCADE).
DELETE FROM "AuditLog"
WHERE "entity" = 'ImportJob'
  AND "entityId" IN (
    SELECT "id" FROM "ImportJob" WHERE "type" = 'ESCOLAS'
  );

DELETE FROM "ImportJob"
WHERE "type" = 'ESCOLAS';

-- Dependências obrigatórias ou vinculadas a escolas.
DELETE FROM "Evaluation";
DELETE FROM "Result";
DELETE FROM "Goal"
WHERE "schoolId" IS NOT NULL;
DELETE FROM "SchoolTechnician";
DELETE FROM "ProgramSchool";

-- Exclusão física, inclusive de escolas anteriormente excluídas logicamente.
DELETE FROM "School";

-- Município e UF deixam de fazer parte do modelo.
DROP INDEX IF EXISTS "School_municipality_idx";

ALTER TABLE "School"
  DROP CONSTRAINT IF EXISTS "School_uf_check",
  DROP COLUMN IF EXISTS "municipality",
  DROP COLUMN IF EXISTS "uf";
