-- CreateEnum
CREATE TYPE "CaseActivityType" AS ENUM ('CASE_CREATED', 'STATUS_CHANGED', 'VISIT_SCHEDULED', 'VISIT_RESCHEDULED', 'VISIT_CANCELLED', 'VISIT_STARTED', 'VISIT_COMPLETED', 'INSPECTION_RECORDED', 'PHOTO_ADDED', 'TREATMENT_ADDED', 'TREATMENT_UPDATED', 'TREATMENT_REMOVED', 'WORKER_ASSIGNED', 'CASE_RESOLVED', 'CASE_CANCELLED');

-- CreateTable
CREATE TABLE "case_activities" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "CaseActivityType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_activities_caseId_createdAt_idx" ON "case_activities"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "case_activities" ADD CONSTRAINT "case_activities_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_activities" ADD CONSTRAINT "case_activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
