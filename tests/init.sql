DROP TABLE IF EXISTS items CASCADE;
CREATE TABLE IF NOT EXISTS items (
	id	SERIAL PRIMARY KEY,
	h		TEXT[],
	name	TEXT
);

DROP TABLE IF EXISTS items2 CASCADE;
CREATE TABLE IF NOT EXISTS items2 (
	id	SERIAL PRIMARY KEY,
	hh		TEXT[],
	name	TEXT
);

DROP TABLE IF EXISTS items3 CASCADE;
CREATE TABLE IF NOT EXISTS items3 (
	id	SERIAL PRIMARY KEY,
	h		TEXT[],
	name	TEXT
);