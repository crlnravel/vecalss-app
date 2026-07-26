-- This forward release starts from the empty canonical assessment baseline.
ALTER TABLE reusable_question_packages ADD COLUMN source_bank_id uuid NOT NULL REFERENCES question_banks(id) ON DELETE RESTRICT;
ALTER TABLE reusable_question_package_items ADD COLUMN point_value numeric(6,2) NOT NULL CHECK (point_value > 0);
ALTER TABLE reusable_question_package_versions ADD COLUMN source_bank_id uuid NOT NULL REFERENCES question_banks(id) ON DELETE RESTRICT;
ALTER TABLE reusable_question_package_version_items ADD COLUMN point_value numeric(6,2) NOT NULL CHECK (point_value > 0);
CREATE INDEX reusable_question_packages_source_bank_id_idx ON reusable_question_packages(source_bank_id);

CREATE OR REPLACE FUNCTION assessment_enforce_reusable_package_one_bank()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_bank uuid; package_subtest uuid; question_bank uuid; question_subtest uuid;
BEGIN
  SELECT source_bank_id, subtest_id INTO source_bank, package_subtest FROM reusable_question_packages WHERE id = NEW.package_id;
  SELECT question_bank_id, subtest_id INTO question_bank, question_subtest FROM questions WHERE id = NEW.source_question_id;
  IF question_bank IS DISTINCT FROM source_bank OR question_subtest IS DISTINCT FROM package_subtest OR NEW.point_value <= 0 THEN
    RAISE EXCEPTION 'package membership must use its source Bank, Subtest, and positive point value' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reusable_question_package_items_one_bank_scored
  BEFORE INSERT OR UPDATE ON reusable_question_package_items
  FOR EACH ROW EXECUTE FUNCTION assessment_enforce_reusable_package_one_bank();
