-- A planilha oficial LOCALIZAÇÃO ESCOLAS classifica as unidades por área
-- operacional (SEDE, ESTRADAS e ILHAS), além da classificação urbana/rural já
-- existente. PostgreSQL exige que os novos valores sejam adicionados ao enum.
ALTER TYPE "SchoolZone" ADD VALUE IF NOT EXISTS 'SEDE';
ALTER TYPE "SchoolZone" ADD VALUE IF NOT EXISTS 'ESTRADAS';
ALTER TYPE "SchoolZone" ADD VALUE IF NOT EXISTS 'ILHAS';
