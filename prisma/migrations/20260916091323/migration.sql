/*
  Warnings:

  - The values [THUMBNAIL] on the enum `JobType` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('VIDEO', 'IMAGE');

-- AlterEnum
BEGIN;
CREATE TYPE "JobType_new" AS ENUM ('UPLOAD', 'TRANSCODE', 'METADATA_EXTRACT', 'EDIT', 'DELETE', 'HIDE', 'CANCELLED');
ALTER TABLE "job_history" ALTER COLUMN "jobType" TYPE "JobType_new" USING ("jobType"::text::"JobType_new");
ALTER TYPE "JobType" RENAME TO "JobType_old";
ALTER TYPE "JobType_new" RENAME TO "JobType";
DROP TYPE "public"."JobType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "job_history" DROP CONSTRAINT "job_history_videoId_fkey";

-- AlterTable
ALTER TABLE "job_history" ALTER COLUMN "videoId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mediaType" "MediaType" NOT NULL DEFAULT 'VIDEO',
ADD COLUMN     "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AddForeignKey
ALTER TABLE "job_history" ADD CONSTRAINT "job_history_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
