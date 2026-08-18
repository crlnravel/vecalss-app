-- Keep the paginated student directory's common filters and sort orders
-- index-backed. The stable id tie-breaker makes page boundaries deterministic.
CREATE INDEX "users_directory_full_name_id_idx"
  ON "users" ("full_name", "id");

CREATE INDEX "users_directory_created_at_id_idx"
  ON "users" ("created_at", "id");

CREATE INDEX "users_directory_status_full_name_id_idx"
  ON "users" ("status", "full_name", "id");

CREATE INDEX "role_assignments_directory_role_idx"
  ON "role_assignments" ("role", "revoked_at", "user_id");
