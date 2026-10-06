import type { TableDefinition } from "../TableConfig/TableConfigTypes";

const shared = {
  target_table: {}, user_id: {}, occurrence: {}, checkpoint: {}, progress: {},
  backoff: { enum: ["fixed", "exponential"] },
  reason: { enum: ["trigger", "rerun"] },
} as const;

export const jobTableConfig = {
  columns: {
    id: "UUID PRIMARY KEY",
    job_name: "TEXT NOT NULL",
    target_table: "TEXT",
    owner: "JSONB NOT NULL",
    params: "JSONB NOT NULL",
    user_id: "TEXT",
    occurrence: "TIMESTAMPTZ",
    reason: "TEXT NOT NULL DEFAULT 'trigger'",
    status: "TEXT NOT NULL DEFAULT 'pending'",
    attempts: "INTEGER NOT NULL DEFAULT 0",
    max_attempts: "INTEGER NOT NULL",
    delay_ms: "DOUBLE PRECISION NOT NULL",
    backoff: "TEXT NOT NULL",
    cancel_requested: "BOOLEAN NOT NULL DEFAULT FALSE",
    checkpoint: "JSONB",
    has_checkpoint: "BOOLEAN NOT NULL DEFAULT FALSE",
    progress: "JSONB",
    error: "TEXT",
    run_at: "TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()",
    lease_token: "UUID",
    locked_until: "TIMESTAMPTZ",
    created_at: "TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()",
    finished_at: "TIMESTAMPTZ",
  },
  check: { $or: [
    { ...shared, status: "pending", error: {} },
    { ...shared, status: "running", error: {}, lease_token: { $ne: null }, locked_until: { $ne: null } },
    { ...shared, status: "succeeded", finished_at: { $ne: null } },
    { ...shared, status: "failed", error: { $ne: null }, finished_at: { $ne: null } },
    { ...shared, status: "cancelled", error: {}, finished_at: { $ne: null } },
  ] },
  indexes: {
    occurrence: { unique: true, columns: "job_name, occurrence", where: "occurrence IS NOT NULL" },
    pending: { columns: "job_name, run_at", where: "status = 'pending'" },
    active: { columns: "job_name", where: "status IN ('pending', 'running')" },
  },
} as const satisfies TableDefinition;
