-- AlterTable
ALTER TABLE "PactoClass" DROP CONSTRAINT IF EXISTS "PactoClass_grade_check";

ALTER TABLE "PactoClass" ADD CONSTRAINT "PactoClass_grade_check" CHECK ("grade" IN (0, 1, 2));
