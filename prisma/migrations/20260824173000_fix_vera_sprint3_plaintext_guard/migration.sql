-- Keep the cross-table plaintext guard polymorphic. Direct NEW.column access is
-- compiled against the trigger table row type and therefore cannot name a
-- column that exists only on the other guarded table.
CREATE OR REPLACE FUNCTION prevent_vera_sprint3_plaintext_write()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb := to_jsonb(NEW);
BEGIN
  IF TG_TABLE_NAME = 'learning_recommendations'
     AND (row_data->>'source_artifact_revision_id' IS NOT NULL OR row_data->>'applied_artifact_revision_id' IS NOT NULL)
     AND row_data->>'reason' IS NOT NULL THEN
    RAISE EXCEPTION 'Vera recommendation plaintext reason is read-only legacy evidence';
  END IF;
  IF TG_TABLE_NAME = 'weakness_analyses'
     AND row_data->>'request_id' IS NOT NULL
     AND row_data->>'summary_markdown' IS NOT NULL THEN
    RAISE EXCEPTION 'Vera analysis plaintext summary is forbidden';
  END IF;
  RETURN NEW;
END;
$$;
