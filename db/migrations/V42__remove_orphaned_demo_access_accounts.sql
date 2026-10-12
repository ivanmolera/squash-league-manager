DO $$
DECLARE
  reference_row record;
  reference_count bigint;
BEGIN
  FOR reference_row IN
    SELECT constraint_row.conrelid::regclass AS table_name, attribute_row.attname AS column_name
    FROM pg_constraint AS constraint_row
    JOIN pg_attribute AS attribute_row
      ON attribute_row.attrelid = constraint_row.conrelid
      AND attribute_row.attnum = constraint_row.conkey[1]
    WHERE constraint_row.contype = 'f'
      AND constraint_row.confrelid = 'app_users'::regclass
      AND constraint_row.conrelid NOT IN ('app_user_roles'::regclass, 'auth_credentials'::regclass)
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %s WHERE %I IN (SELECT id FROM app_users WHERE email LIKE %L)',
      reference_row.table_name,
      reference_row.column_name,
      '%@demo.squash.local'
    ) INTO reference_count;

    IF reference_count > 0 THEN
      RAISE EXCEPTION 'Demo accounts still referenced by %.% (% rows)',
        reference_row.table_name, reference_row.column_name, reference_count;
    END IF;
  END LOOP;

  DELETE FROM app_users WHERE email LIKE '%@demo.squash.local';
END $$;
