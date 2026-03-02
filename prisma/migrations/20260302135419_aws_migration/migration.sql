/*
  Warnings:

  - You are about to drop the column `summaryEmbedding` on the `SourceCodeEmbedding` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[projectId,fileName]` on the table `SourceCodeEmbedding` will be added. If there are existing duplicate values, this will fail.
  - Made the column `credits` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "SourceCodeEmbedding" DROP COLUMN "summaryEmbedding",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "embedding" vector(1024),
ADD COLUMN     "sha" TEXT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "credits" SET NOT NULL;

-- AlterTable
ALTER TABLE "UserToProject" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'MEMBER';

-- CreateTable
CREATE TABLE "meeting_sessions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "meetingUrl" TEXT NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "transcript" TEXT,
    "summary" JSONB,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "meeting_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceCodeEmbedding_projectId_fileName_key" ON "SourceCodeEmbedding"("projectId", "fileName");

-- AddForeignKey
ALTER TABLE "meeting_sessions" ADD CONSTRAINT "meeting_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
