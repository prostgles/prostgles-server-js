import type { AuditTableRow } from "./AuditTable";

const UUID_OR_NULL = "prostgles.uuid_or_null";
const jobIdKey = "jobId" satisfies keyof NonNullable<AuditTableRow["execution_context"]>;

export const getAuditJobIdSQL = (executionContext: string) =>
  `${UUID_OR_NULL}(${executionContext}->>'${jobIdKey}')`;

export const CREATE_UUID_OR_NULL_SQL = `
  CREATE OR REPLACE FUNCTION ${UUID_OR_NULL}(value text) RETURNS pg_catalog.uuid
  LANGUAGE plpgsql IMMUTABLE STRICT AS $$
  BEGIN
    RETURN value::pg_catalog.uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
  $$;
`;
