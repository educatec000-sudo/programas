-- AlterTable
ALTER TABLE "School" ADD COLUMN     "addressComplement" TEXT,
ADD COLUMN     "addressNumber" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "schoolType" TEXT,
ADD COLUMN     "uf" TEXT,
ALTER COLUMN "inep" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "School_district_idx" ON "School"("district");
