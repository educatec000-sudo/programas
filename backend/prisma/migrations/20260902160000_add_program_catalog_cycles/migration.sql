-- Separa o programa permanente (catálogo) de suas execuções anuais/ciclos.
-- A migração apenas cria o agrupador e vincula registros existentes: nenhuma
-- escola, avaliação, resultado, turma ou coleta é movida ou excluída.
BEGIN;

CREATE TABLE "ProgramCatalog" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "objective" TEXT,
    "organ" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProgramCatalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProgramCatalog_code_key" ON "ProgramCatalog"("code");
CREATE INDEX "ProgramCatalog_name_idx" ON "ProgramCatalog"("name");
CREATE INDEX "ProgramCatalog_deletedAt_idx" ON "ProgramCatalog"("deletedAt");

ALTER TABLE "Program" ADD COLUMN "catalogId" TEXT;

-- Materializa uma chave permanente removendo o segmento AAAA do código quando
-- ele coincide com o ano da execução. Nomes perdem somente o ano final. O nome
-- normalizado agrupa códigos legados distintos do mesmo programa.
CREATE TEMP TABLE "_ProgramCatalogBackfill" AS
SELECT
    p."id" AS "programId",
    p."year" AS "cycleYear",
    COALESCE(
        NULLIF(ARRAY_TO_STRING(ARRAY_REMOVE(REGEXP_SPLIT_TO_ARRAY(p."code", '[-_]'), p."year"::TEXT), '-'), ''),
        p."code"
    ) AS "catalogCode",
    CASE
        WHEN p."name" ~ ('[[:space:]]+' || p."year"::TEXT || '$')
            THEN REGEXP_REPLACE(p."name", '[[:space:]]+' || p."year"::TEXT || '$', '')
        ELSE p."name"
    END AS "catalogName",
    LOWER(TRIM(CASE
        WHEN p."name" ~ ('[[:space:]]+' || p."year"::TEXT || '$')
            THEN REGEXP_REPLACE(p."name", '[[:space:]]+' || p."year"::TEXT || '$', '')
        ELSE p."name"
    END)) AS "catalogKey",
    p."description",
    p."objective",
    p."organ",
    p."createdAt",
    p."updatedAt",
    p."deletedAt"
FROM "Program" p;

-- Interrompe e reverte integralmente a migração se os dados antigos forem
-- ambíguos. Nenhum ciclo é mesclado automaticamente.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "_ProgramCatalogBackfill"
        GROUP BY "catalogKey", "cycleYear"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existem programas duplicados para o mesmo catálogo e ano; revise-os antes da migração';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "_ProgramCatalogBackfill"
        GROUP BY "catalogCode"
        HAVING COUNT(DISTINCT "catalogKey") > 1
    ) THEN
        RAISE EXCEPTION 'Códigos permanentes colidem entre programas diferentes; revise os códigos antes da migração';
    END IF;
END $$;

-- Se já houver mais de uma execução do mesmo programa, o registro mais antigo
-- fornece a identidade do catálogo e todas as execuções apontam para ele.
INSERT INTO "ProgramCatalog" (
    "id", "code", "name", "description", "objective", "organ",
    "createdAt", "updatedAt", "deletedAt"
)
SELECT DISTINCT ON (b."catalogKey")
    b."programId",
    b."catalogCode",
    b."catalogName",
    b."description",
    b."objective",
    b."organ",
    b."createdAt",
    b."updatedAt",
    CASE
        WHEN EXISTS (
            SELECT 1 FROM "_ProgramCatalogBackfill" active
            WHERE active."catalogKey" = b."catalogKey" AND active."deletedAt" IS NULL
        ) THEN NULL
        ELSE b."deletedAt"
    END
FROM "_ProgramCatalogBackfill" b
ORDER BY b."catalogKey", b."createdAt" ASC, b."programId" ASC;

UPDATE "Program" p
SET "catalogId" = c."id"
FROM "_ProgramCatalogBackfill" b
JOIN "_ProgramCatalogBackfill" owner ON owner."catalogKey" = b."catalogKey"
JOIN "ProgramCatalog" c ON c."id" = owner."programId"
WHERE p."id" = b."programId"
  AND owner."programId" = (
      SELECT chosen."programId"
      FROM "_ProgramCatalogBackfill" chosen
      WHERE chosen."catalogKey" = b."catalogKey"
      ORDER BY chosen."createdAt" ASC, chosen."programId" ASC
      LIMIT 1
  );

DROP TABLE "_ProgramCatalogBackfill";

ALTER TABLE "Program" ALTER COLUMN "catalogId" SET NOT NULL;
CREATE UNIQUE INDEX "Program_catalogId_year_key" ON "Program"("catalogId", "year");
ALTER TABLE "Program"
    ADD CONSTRAINT "Program_catalogId_fkey"
    FOREIGN KEY ("catalogId") REFERENCES "ProgramCatalog"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
