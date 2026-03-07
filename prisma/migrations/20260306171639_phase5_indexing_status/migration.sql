-- CreateEnum
CREATE TYPE "IndexingStatus" AS ENUM ('IDLE', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'ERROR');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "indexingMeta" JSONB,
ADD COLUMN     "indexingStatus" "IndexingStatus" NOT NULL DEFAULT 'IDLE';
