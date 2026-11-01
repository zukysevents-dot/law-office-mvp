-- Komentář patří právě jednomu projektu, nebo právě jednomu případu.
ALTER TABLE "matterComments"
  ADD CONSTRAINT "matterComments_single_parent_check"
  CHECK (("projectId" IS NULL) <> ("caseId" IS NULL));
