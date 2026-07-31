ALTER TABLE "organizations"
ADD COLUMN "billingTimeIncrementMinutes" INTEGER NOT NULL DEFAULT 15;

-- Approval is represented exclusively by approvalStatus. Convert the legacy
-- duplicate billing state without losing the fact that the row awaits review.
UPDATE "workLogs"
SET
  "billingStatus" = 'BILLABLE',
  "approvalStatus" = CASE
    WHEN "approvalStatus" = 'APPROVED' THEN 'APPROVED'::"ApprovalStatus"
    ELSE 'SUBMITTED'::"ApprovalStatus"
  END
WHERE "billingStatus" = 'NEEDS_APPROVAL';
