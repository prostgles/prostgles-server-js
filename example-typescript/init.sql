
DROP TABLE IF EXISTS pixels CASCADE;

CREATE TABLE IF NOT EXISTS pixels (
    id      SERIAL PRIMARY KEY,
    rgb     TEXT,
    xy      TEXT,
    last_updated BIGINT,
    drawn   BOOLEAN,
    blb     BYTEA
);