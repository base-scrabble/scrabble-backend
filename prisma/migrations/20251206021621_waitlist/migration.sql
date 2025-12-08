/*
  Warnings:

  - Made the column `referralCount` on table `Waitlist` required. This step will fail if there are existing NULL values in that column.
  - Made the column `createdAt` on table `Waitlist` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Waitlist" ALTER COLUMN "email" SET DATA TYPE TEXT,
ALTER COLUMN "code" SET DATA TYPE TEXT,
ALTER COLUMN "referralCount" SET NOT NULL,
ALTER COLUMN "createdAt" SET NOT NULL,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);
