-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "canBeTechnician" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "School" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "SchoolTechnician" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolTechnician_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolTechnician_technicianId_idx" ON "SchoolTechnician"("technicianId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolTechnician_schoolId_technicianId_key" ON "SchoolTechnician"("schoolId", "technicianId");

-- CreateIndex
CREATE INDEX "School_zone_idx" ON "School"("zone");

-- CreateIndex
CREATE INDEX "User_name_idx" ON "User"("name");

-- AddForeignKey
ALTER TABLE "SchoolTechnician" ADD CONSTRAINT "SchoolTechnician_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolTechnician" ADD CONSTRAINT "SchoolTechnician_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
