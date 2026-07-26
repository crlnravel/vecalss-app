-- Ready package versions are audit/fairness snapshots. A repository must build
-- children while the version is draft, then make one final draft -> published
-- transition. Direct SQL and future ORM writers cannot mutate that ready state.
CREATE OR REPLACE FUNCTION assessment_reject_ready_package_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_status content_status;
BEGIN
  IF TG_TABLE_NAME = 'reusable_question_package_versions' THEN
    IF OLD.status = 'published' THEN
      RAISE EXCEPTION 'ready reusable package versions are immutable' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'reusable_question_package_version_items' THEN
    SELECT status INTO version_status FROM reusable_question_package_versions WHERE id = COALESCE(NEW.package_version_id, OLD.package_version_id);
  ELSIF TG_TABLE_NAME = 'reusable_question_package_version_item_options' THEN
    SELECT version.status INTO version_status
      FROM reusable_question_package_version_items item
      JOIN reusable_question_package_versions version ON version.id = item.package_version_id
      WHERE item.id = COALESCE(NEW.package_version_item_id, OLD.package_version_item_id);
  END IF;

  IF version_status = 'published' THEN
    RAISE EXCEPTION 'ready reusable package version snapshots are immutable' USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reusable_question_package_versions_ready_immutable
  BEFORE UPDATE OR DELETE ON reusable_question_package_versions
  FOR EACH ROW EXECUTE FUNCTION assessment_reject_ready_package_version_mutation();

CREATE TRIGGER reusable_question_package_version_items_ready_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON reusable_question_package_version_items
  FOR EACH ROW EXECUTE FUNCTION assessment_reject_ready_package_version_mutation();

CREATE TRIGGER reusable_question_package_version_item_options_ready_immutable
  BEFORE INSERT OR UPDATE OR DELETE ON reusable_question_package_version_item_options
  FOR EACH ROW EXECUTE FUNCTION assessment_reject_ready_package_version_mutation();
