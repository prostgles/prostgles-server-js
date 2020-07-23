
DROP TABLE IF EXISTS pixels CASCADE;

CREATE TABLE IF NOT EXISTS pixels (
    id      bigint primary key generated always as identity,
    rgb     TEXT,
    xy      TEXT,
    last_updated BIGINT,
    drawn   BOOLEAN,
    blb     BYTEA
);