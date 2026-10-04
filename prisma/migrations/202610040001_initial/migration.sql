-- CreateEnum
CREATE TYPE "Occupancy" AS ENUM ('AVAILABLE', 'OCCUPIED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RuleStatus" AS ENUM ('PASS', 'FAIL', 'NOT_DETERMINABLE');

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "ownershipEntity" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "areaSqm" DECIMAL(10,2) NOT NULL,
    "parkingBay" TEXT NOT NULL,
    "status" "Occupancy" NOT NULL,
    "buildingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lease" (
    "id" TEXT NOT NULL,
    "unitId" TEXT,
    "candidateUnitId" TEXT,
    "linked" BOOLEAN NOT NULL DEFAULT false,
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'COMPLETED',
    "provider" TEXT NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseDocument" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,

    CONSTRAINT "LeaseDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseExtractedField" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "originalValue" JSONB NOT NULL,
    "currentValue" JSONB NOT NULL,
    "amount" DECIMAL(18,2),
    "currency" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "overridden" BOOLEAN NOT NULL DEFAULT false,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseExtractedField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseSourceReference" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "page" INTEGER,
    "paragraph" INTEGER,
    "line" INTEGER,
    "excerpt" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "LeaseSourceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseFlag" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaseRuleValidation" (
    "id" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" "RuleStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "values" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaseRuleValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueReport" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'COMPLETED',
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuePhoto" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,

    CONSTRAINT "IssuePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueAssessment" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "summary" TEXT NOT NULL,

    CONSTRAINT "IssueAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectedAsset" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "DetectedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetectedDamage" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "DetectedDamage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftWorkOrder" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftWorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_LeaseFlagToLeaseSourceReference" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_LeaseFlagToLeaseSourceReference_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_LeaseRuleValidationToLeaseSourceReference" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_LeaseRuleValidationToLeaseSourceReference_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_IssueAssessmentToIssuePhoto" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_IssueAssessmentToIssuePhoto_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_DetectedAssetToIssuePhoto" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DetectedAssetToIssuePhoto_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_DetectedDamageToIssuePhoto" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DetectedDamageToIssuePhoto_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_DraftWorkOrderToIssuePhoto" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DraftWorkOrderToIssuePhoto_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "Building_propertyId_idx" ON "Building"("propertyId");

-- CreateIndex
CREATE INDEX "Unit_buildingId_status_idx" ON "Unit"("buildingId", "status");

-- CreateIndex
CREATE INDEX "Lease_unitId_idx" ON "Lease"("unitId");

-- CreateIndex
CREATE INDEX "Lease_candidateUnitId_idx" ON "Lease"("candidateUnitId");

-- CreateIndex
CREATE INDEX "Lease_processingStatus_idx" ON "Lease"("processingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseDocument_leaseId_key" ON "LeaseDocument"("leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseDocument_storageKey_key" ON "LeaseDocument"("storageKey");

-- CreateIndex
CREATE INDEX "LeaseExtractedField_leaseId_reviewStatus_idx" ON "LeaseExtractedField"("leaseId", "reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseExtractedField_leaseId_key_key" ON "LeaseExtractedField"("leaseId", "key");

-- CreateIndex
CREATE INDEX "LeaseSourceReference_fieldId_idx" ON "LeaseSourceReference"("fieldId");

-- CreateIndex
CREATE INDEX "LeaseFlag_leaseId_reviewStatus_idx" ON "LeaseFlag"("leaseId", "reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "LeaseRuleValidation_leaseId_ruleId_key" ON "LeaseRuleValidation"("leaseId", "ruleId");

-- CreateIndex
CREATE INDEX "IssueReport_unitId_processingStatus_idx" ON "IssueReport"("unitId", "processingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "IssuePhoto_storageKey_key" ON "IssuePhoto"("storageKey");

-- CreateIndex
CREATE INDEX "IssuePhoto_issueId_idx" ON "IssuePhoto"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "IssueAssessment_issueId_key" ON "IssueAssessment"("issueId");

-- CreateIndex
CREATE INDEX "DetectedAsset_issueId_idx" ON "DetectedAsset"("issueId");

-- CreateIndex
CREATE INDEX "DetectedDamage_issueId_idx" ON "DetectedDamage"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftWorkOrder_issueId_key" ON "DraftWorkOrder"("issueId");

-- CreateIndex
CREATE INDEX "DraftWorkOrder_reviewStatus_idx" ON "DraftWorkOrder"("reviewStatus");

-- CreateIndex
CREATE INDEX "_LeaseFlagToLeaseSourceReference_B_index" ON "_LeaseFlagToLeaseSourceReference"("B");

-- CreateIndex
CREATE INDEX "_LeaseRuleValidationToLeaseSourceReference_B_index" ON "_LeaseRuleValidationToLeaseSourceReference"("B");

-- CreateIndex
CREATE INDEX "_IssueAssessmentToIssuePhoto_B_index" ON "_IssueAssessmentToIssuePhoto"("B");

-- CreateIndex
CREATE INDEX "_DetectedAssetToIssuePhoto_B_index" ON "_DetectedAssetToIssuePhoto"("B");

-- CreateIndex
CREATE INDEX "_DetectedDamageToIssuePhoto_B_index" ON "_DetectedDamageToIssuePhoto"("B");

-- CreateIndex
CREATE INDEX "_DraftWorkOrderToIssuePhoto_B_index" ON "_DraftWorkOrderToIssuePhoto"("B");

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_candidateUnitId_fkey" FOREIGN KEY ("candidateUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseDocument" ADD CONSTRAINT "LeaseDocument_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseExtractedField" ADD CONSTRAINT "LeaseExtractedField_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseSourceReference" ADD CONSTRAINT "LeaseSourceReference_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "LeaseDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseSourceReference" ADD CONSTRAINT "LeaseSourceReference_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "LeaseExtractedField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseFlag" ADD CONSTRAINT "LeaseFlag_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseRuleValidation" ADD CONSTRAINT "LeaseRuleValidation_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueReport" ADD CONSTRAINT "IssueReport_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuePhoto" ADD CONSTRAINT "IssuePhoto_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "IssueReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueAssessment" ADD CONSTRAINT "IssueAssessment_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "IssueReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectedAsset" ADD CONSTRAINT "DetectedAsset_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "IssueReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetectedDamage" ADD CONSTRAINT "DetectedDamage_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "IssueReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftWorkOrder" ADD CONSTRAINT "DraftWorkOrder_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "IssueReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LeaseFlagToLeaseSourceReference" ADD CONSTRAINT "_LeaseFlagToLeaseSourceReference_A_fkey" FOREIGN KEY ("A") REFERENCES "LeaseFlag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LeaseFlagToLeaseSourceReference" ADD CONSTRAINT "_LeaseFlagToLeaseSourceReference_B_fkey" FOREIGN KEY ("B") REFERENCES "LeaseSourceReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LeaseRuleValidationToLeaseSourceReference" ADD CONSTRAINT "_LeaseRuleValidationToLeaseSourceReference_A_fkey" FOREIGN KEY ("A") REFERENCES "LeaseRuleValidation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LeaseRuleValidationToLeaseSourceReference" ADD CONSTRAINT "_LeaseRuleValidationToLeaseSourceReference_B_fkey" FOREIGN KEY ("B") REFERENCES "LeaseSourceReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IssueAssessmentToIssuePhoto" ADD CONSTRAINT "_IssueAssessmentToIssuePhoto_A_fkey" FOREIGN KEY ("A") REFERENCES "IssueAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_IssueAssessmentToIssuePhoto" ADD CONSTRAINT "_IssueAssessmentToIssuePhoto_B_fkey" FOREIGN KEY ("B") REFERENCES "IssuePhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DetectedAssetToIssuePhoto" ADD CONSTRAINT "_DetectedAssetToIssuePhoto_A_fkey" FOREIGN KEY ("A") REFERENCES "DetectedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DetectedAssetToIssuePhoto" ADD CONSTRAINT "_DetectedAssetToIssuePhoto_B_fkey" FOREIGN KEY ("B") REFERENCES "IssuePhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DetectedDamageToIssuePhoto" ADD CONSTRAINT "_DetectedDamageToIssuePhoto_A_fkey" FOREIGN KEY ("A") REFERENCES "DetectedDamage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DetectedDamageToIssuePhoto" ADD CONSTRAINT "_DetectedDamageToIssuePhoto_B_fkey" FOREIGN KEY ("B") REFERENCES "IssuePhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DraftWorkOrderToIssuePhoto" ADD CONSTRAINT "_DraftWorkOrderToIssuePhoto_A_fkey" FOREIGN KEY ("A") REFERENCES "DraftWorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DraftWorkOrderToIssuePhoto" ADD CONSTRAINT "_DraftWorkOrderToIssuePhoto_B_fkey" FOREIGN KEY ("B") REFERENCES "IssuePhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
