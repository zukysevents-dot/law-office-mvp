-- Public registration no longer requires e-mail confirmation; pending
-- verification rows (incl. their password hashes) are discarded.
DROP TABLE IF EXISTS "emailVerificationTokens";
