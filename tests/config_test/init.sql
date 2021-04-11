

DROP TABLE IF EXISTS various CASCADE;
CREATE TABLE IF NOT EXISTS various (
	id	SERIAL PRIMARY KEY,
	h		TEXT[],
	name	TEXT,
	tsv 	TSVECTOR,
	jsn		JSON DEFAULT '{}'::JSON,
	added		TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE VIEW v_various AS
SELECT * FROM various;

DROP TABLE IF EXISTS items CASCADE;
CREATE TABLE IF NOT EXISTS items (
	id	SERIAL PRIMARY KEY,
	name	TEXT,
	tst TIMESTAMP DEFAULT NOW()
);

INSERT INTO items(name) VALUES ('a123'), ('b'),('a'), ('b'),('a'), ('b'),('a'), ('b'), ('cc233'), (null);



DROP TABLE IF EXISTS item_children CASCADE;
CREATE TABLE IF NOT EXISTS item_children (
	id	SERIAL PRIMARY KEY,
	item_id INTEGER REFERENCES items(id),
	name	TEXT,
	tst TIMESTAMP DEFAULT NOW()
);

INSERT INTO item_children(name) VALUES ('a'), ('b'),('a'), ('b'),('a'), ('b'),('a'), ('b'), ('c');