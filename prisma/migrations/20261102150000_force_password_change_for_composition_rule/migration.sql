-- The password rule now also requires a symbol. Existing password hashes can't
-- be checked against it, so every account that exists when this runs must pick
-- a new password at next sign-in. No session is revoked: the existing
-- must_change_password flag already sends every role to the change-password
-- page and blocks the protected actions until it is done.
-- Accounts created after this migration meet the rule when they are created.
UPDATE "users" SET "must_change_password" = true;
