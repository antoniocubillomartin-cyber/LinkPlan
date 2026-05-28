-- AlterTable
ALTER TABLE "Venue" ADD COLUMN "urlValid" BOOLEAN;
ALTER TABLE "Venue" ADD COLUMN "lastStatusCode" INTEGER;
ALTER TABLE "Venue" ADD COLUMN "lastVerified" TIMESTAMP(3);
