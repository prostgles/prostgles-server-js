import { md5 } from "prostgles-types/dist/md5";

// Persisted database names: creation and cleanup must use the same prefixes.
// Keep generated names within PostgreSQL's 63-byte identifier limit.
export const TABLE_CONFIG_TRIGGER_PREFIX = "prostgles_table_config_";
export const AUDIT_TRIGGER_PREFIX = "prostgles_audit_";
export const MUTATION_TRIGGER_PREFIX = "prostgles_capture_";
export const AUDIT_HISTORY_PROTECTION_PREFIX = AUDIT_TRIGGER_PREFIX + "guard_";
export const AUDIT_TRUNCATE_PROTECTION_PREFIX = AUDIT_TRIGGER_PREFIX + "block_";
export const AUDIT_WRITER_PREFIX = AUDIT_TRIGGER_PREFIX + "write_";

export const isManagedTriggerName = (name: string) =>
  name.startsWith(TABLE_CONFIG_TRIGGER_PREFIX) ||
  name.startsWith(AUDIT_TRIGGER_PREFIX) ||
  name.startsWith(MUTATION_TRIGGER_PREFIX);

export const getManagedTriggerName = (functionName: string, action: string) =>
  `${isManagedTriggerName(functionName) ? functionName : TABLE_CONFIG_TRIGGER_PREFIX + md5(functionName)}_${action}`;
