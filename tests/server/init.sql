CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

DROP TABLE IF EXISTS shapes CASCADE;
CREATE TABLE IF NOT EXISTS shapes (
	id		UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	geog	GEOGRAPHY,
	geom 	GEOMETRY
);

DROP TABLE IF EXISTS prostgles_lookup_media_items_m1;
DROP TABLE IF EXISTS prostgles_lookup_media_items_with_media;
DROP TABLE IF EXISTS prostgles_lookup_media_items_with_one_media;
 

DROP TABLE IF EXISTS media CASCADE;

DROP TABLE IF EXISTS items_with_one_media CASCADE;
CREATE TABLE IF NOT EXISTS items_with_one_media (
	id		SERIAL PRIMARY KEY,
	name	TEXT
);

DROP TABLE IF EXISTS insert_rules CASCADE;
CREATE TABLE IF NOT EXISTS insert_rules (
	id		SERIAL PRIMARY KEY,
	name	TEXT,
	added		TIMESTAMP DEFAULT NOW()
);

DROP TABLE IF EXISTS items_with_media CASCADE;
CREATE TABLE IF NOT EXISTS items_with_media (
	id		SERIAL PRIMARY KEY,
	name	TEXT
);

-- DROP TABLE IF EXISTS items_with_media_cols CASCADE;
-- CREATE TABLE IF NOT EXISTS items_with_media_cols (
-- 	id		SERIAL PRIMARY KEY,
-- 	"desc" TEXT,
-- 	file_id UUID REFERENCES media(id)
-- );


DROP TABLE IF EXISTS various CASCADE;
CREATE TABLE IF NOT EXISTS various (
	id		SERIAL PRIMARY KEY,
	h		TEXT[],
	name	TEXT,
	tsv 	TSVECTOR,
	jsn		JSON DEFAULT '{}'::JSON,
	added		TIMESTAMP DEFAULT NOW()
);

DROP TABLE IF EXISTS items CASCADE;
CREATE TABLE IF NOT EXISTS items (
	id		SERIAL PRIMARY KEY,
	h		TEXT[],
	name	TEXT
	-- PRIMARY KEY(id, id1)
);

DROP TABLE IF EXISTS items2 CASCADE;
CREATE TABLE IF NOT EXISTS items2 (
	id			SERIAL PRIMARY KEY,
	items_id	INTEGER REFERENCES items(id),
	hh			TEXT[],
	name		TEXT
);

DROP TABLE IF EXISTS items3 CASCADE;
CREATE TABLE IF NOT EXISTS items3 (
	id		SERIAL PRIMARY KEY,
	h		TEXT[],
	name	TEXT
);

DROP TABLE IF EXISTS items4a CASCADE;
CREATE TABLE IF NOT EXISTS items4a (
	id		SERIAL PRIMARY KEY,
	items_id	INTEGER REFERENCES items(id),
	items2_id	INTEGER REFERENCES items2(id),
	name	TEXT
);

DROP TABLE IF EXISTS items_multi CASCADE;
CREATE TABLE IF NOT EXISTS items_multi (
	id		SERIAL PRIMARY KEY,
	items0_id	INTEGER REFERENCES items(id),
	items1_id	INTEGER REFERENCES items(id),
	items2_id	INTEGER REFERENCES items(id),
	items3_id	INTEGER REFERENCES items(id),
	name	TEXT
);

DROP TABLE IF EXISTS items4 CASCADE;
CREATE TABLE IF NOT EXISTS items4 (
	id			SERIAL,
	public		TEXT,
	name		TEXT,
	added		TIMESTAMP DEFAULT NOW(),
	PRIMARY KEY(id, name)
);
DROP TABLE IF EXISTS items4_pub CASCADE;
CREATE TABLE IF NOT EXISTS items4_pub (
	id			SERIAL,
	public	TEXT,
	name		TEXT,
	added		TIMESTAMP DEFAULT NOW(),
	PRIMARY KEY(id, name)
);
CREATE INDEX IF NOT EXISTS idx1 ON items(name);
CREATE INDEX IF NOT EXISTS idx2 ON items2(name);
CREATE INDEX IF NOT EXISTS idx3 ON items3(name);

DROP VIEW IF EXISTS v_items;
CREATE VIEW v_items AS
SELECT id, name FROM items UNION
SELECT id, name FROM items2 UNION
SELECT id, name FROM items2 UNION
SELECT id, name FROM items3;




DROP TABLE IF EXISTS planes CASCADE;
CREATE TABLE IF NOT EXISTS planes (
	id							SERIAL PRIMARY KEY,
	x								INTEGER,
	y								INTEGER,
	flight_number		TEXT,
	last_updated		BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS planes_idx1 ON planes(id);



DROP TABLE IF EXISTS ex_j_ins CASCADE;
CREATE TABLE IF NOT EXISTS ex_j_ins (
	id			SERIAL,
	public	TEXT,
	name		TEXT,
	added		TIMESTAMP DEFAULT NOW(),
	PRIMARY KEY(id, name)
);


DROP TABLE IF EXISTS "*" CASCADE;
CREATE TABLE IF NOT EXISTS "*" (
	id			SERIAL PRIMARY KEY,
	"*"			TEXT
);

DROP TABLE IF EXISTS """*""" CASCADE;
CREATE TABLE IF NOT EXISTS """*""" (
	id			SERIAL PRIMARY KEY,
	qq       TEXT,
	"""*"""			TEXT
);

DROP TABLE IF EXISTS hehe CASCADE;


DROP TABLE IF EXISTS tr1 CASCADE;
CREATE TABLE IF NOT EXISTS tr1 (
	id			SERIAL PRIMARY KEY,
	t1			TEXT
);

DROP TABLE IF EXISTS tr2 CASCADE;
CREATE TABLE IF NOT EXISTS tr2 (
	id			SERIAL PRIMARY KEY,
	tr1_id	INTEGER REFERENCES tr1(id),
	t1			TEXT,
	t2			TEXT,
	UNIQUE(id, t1)
);

DROP TABLE IF EXISTS obj_table CASCADE;
CREATE TABLE IF NOT EXISTS obj_table (
	id			SERIAL PRIMARY KEY,
	obj			JSONB
);

CREATE SCHEMA IF NOT EXISTS prostgles_test;
DROP TABLE IF EXISTS prostgles_test.basic CASCADE;
CREATE TABLE IF NOT EXISTS prostgles_test.basic (
	id			SERIAL PRIMARY KEY,
  txt     text
);
DROP TABLE IF EXISTS prostgles_test.basic1 CASCADE;
CREATE TABLE IF NOT EXISTS prostgles_test.basic1 (
	id			  SERIAL PRIMARY KEY,
  id_basic  INTEGER REFERENCES prostgles_test.basic,
  txt       text
);


DROP MATERIALIZED VIEW IF EXISTS prostgles_test.mv_basic1;
CREATE MATERIALIZED VIEW prostgles_test.mv_basic1 AS
  SELECT * FROM prostgles_test.basic1;

DROP TABLE IF EXISTS self_join CASCADE;
CREATE TABLE self_join (
  id SERIAL PRIMARY KEY,
  name TEXT,
  my_id INTEGER REFERENCES self_join,
  my_id1 INTEGER REFERENCES self_join
);