/*
  Warnings:

  - You are about to drop the column `assignee` on the `MarketingTask` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "MarketingTask" DROP COLUMN "assignee",
ADD COLUMN     "assigneeId" TEXT;

-- AddForeignKey
ALTER TABLE "MarketingTask" ADD CONSTRAINT "MarketingTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
