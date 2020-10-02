DROP TABLE IF EXISTS items CASCADE;
CREATE TABLE IF NOT EXISTS items (
    id      SERIAL PRIMARY KEY,
    name    TEXT,
    hidden BOOLEAN,
    synced  BIGINT
);