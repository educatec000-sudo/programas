-- Registra a identidade real do primeiro programa implementado.
-- A operação é idempotente e preserva os metadados de um cadastro existente.
DO $$
DECLARE
    pacto_program_id TEXT;
BEGIN
    -- Prioriza um registro que já use o código técnico canônico, inclusive se
    -- estiver arquivado. O código identifica especificamente o ciclo de 2026.
    SELECT "id"
      INTO pacto_program_id
      FROM "Program"
     WHERE "code" = 'PACTO-ALFABETIZACAO-2026'
     LIMIT 1;

    IF pacto_program_id IS NOT NULL THEN
        UPDATE "Program"
           SET "year" = 2026,
               "deletedAt" = NULL,
               "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = pacto_program_id;
        RETURN;
    END IF;

    -- Se o programa real já tiver sido cadastrado com outro código, reutiliza
    -- esse registro em vez de criar um cartão duplicado.
    SELECT "id"
      INTO pacto_program_id
      FROM "Program"
     WHERE "year" = 2026
       AND "deletedAt" IS NULL
       AND LOWER("name") LIKE '%pacto%alfabetiza%'
     ORDER BY "createdAt" ASC
     LIMIT 1;

    IF pacto_program_id IS NOT NULL THEN
        UPDATE "Program"
           SET "code" = 'PACTO-ALFABETIZACAO-2026',
               "updatedAt" = CURRENT_TIMESTAMP
         WHERE "id" = pacto_program_id;
        RETURN;
    END IF;

    -- Não inventa escolas, indicadores, resultados, metas ou pontuações. Cria
    -- somente o registro oficial mínimo necessário para exibir o programa.
    INSERT INTO "Program" (
        "id",
        "code",
        "name",
        "year",
        "status",
        "createdAt",
        "updatedAt"
    ) VALUES (
        'b7a2d6b0-0f31-4cbe-9d5e-202600000001',
        'PACTO-ALFABETIZACAO-2026',
        'Pacto pela Alfabetização 2026',
        2026,
        'EM_EXECUCAO',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    );
END $$;
