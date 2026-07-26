-- Reusable package authoring is additive. Existing Tryout drafts can be opened
-- and bound progressively; publication enforces all seven bindings in the repository.
CREATE TYPE tryout_test_type AS ENUM ('cbt', 'cat');

CREATE TABLE reusable_question_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(100) NOT NULL UNIQUE,
  title varchar(220) NOT NULL,
  description text,
  subtest_id uuid NOT NULL REFERENCES subtests(id) ON DELETE RESTRICT,
  status content_status NOT NULL DEFAULT 'draft',
  revision integer NOT NULL DEFAULT 1,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reusable_question_packages_subtest_id_status_idx ON reusable_question_packages(subtest_id, status);

CREATE TABLE reusable_question_package_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES reusable_question_packages(id) ON DELETE CASCADE,
  source_question_id uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(package_id, source_question_id),
  UNIQUE(package_id, sort_order)
);

CREATE TABLE reusable_question_package_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES reusable_question_packages(id) ON DELETE RESTRICT,
  version_no integer NOT NULL,
  status content_status NOT NULL DEFAULT 'draft',
  ready_at timestamptz,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(package_id, version_no)
);
CREATE INDEX reusable_question_package_versions_package_id_status_idx ON reusable_question_package_versions(package_id, status);

CREATE TABLE reusable_question_package_version_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_version_id uuid NOT NULL REFERENCES reusable_question_package_versions(id) ON DELETE CASCADE,
  source_question_id uuid NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL,
  prompt text NOT NULL,
  explanation text,
  difficulty difficulty_level NOT NULL DEFAULT 'medium',
  subtest_id uuid NOT NULL REFERENCES subtests(id) ON DELETE RESTRICT,
  prompt_asset_id uuid REFERENCES assets(id) ON DELETE RESTRICT,
  explanation_asset_id uuid REFERENCES assets(id) ON DELETE RESTRICT,
  UNIQUE(package_version_id, source_question_id),
  UNIQUE(package_version_id, sort_order)
);

CREATE TABLE reusable_question_package_version_item_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_version_item_id uuid NOT NULL REFERENCES reusable_question_package_version_items(id) ON DELETE CASCADE,
  choice_key varchar(64) NOT NULL,
  content text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL,
  source_question_option_id uuid REFERENCES question_options(id) ON DELETE RESTRICT,
  asset_id uuid REFERENCES assets(id) ON DELETE RESTRICT,
  UNIQUE(package_version_item_id, choice_key),
  UNIQUE(package_version_item_id, sort_order)
);

ALTER TABLE tryout_sections
  ADD COLUMN package_version_id uuid REFERENCES reusable_question_package_versions(id) ON DELETE RESTRICT,
  ADD COLUMN instructions text,
  ADD COLUMN test_type tryout_test_type NOT NULL DEFAULT 'cbt',
  ADD COLUMN scoring_config jsonb,
  ADD COLUMN shuffle_items boolean NOT NULL DEFAULT false,
  ADD COLUMN cat_item_count integer,
  ADD COLUMN cat_model_version varchar(120);
ALTER TABLE tryout_items ADD COLUMN package_version_id uuid REFERENCES reusable_question_package_versions(id) ON DELETE RESTRICT;
CREATE INDEX tryout_sections_package_version_id_idx ON tryout_sections(package_version_id);
CREATE INDEX tryout_items_package_version_id_idx ON tryout_items(package_version_id);
