


DROP TABLE IF EXISTS items CASCADE;
CREATE TABLE IF NOT EXISTS items (
	id	SERIAL PRIMARY KEY,
	name	TEXT,
	tst TIMESTAMP DEFAULT NOW()
);

INSERT INTO items(name) VALUES ('a'), ('b'),('a'), ('b'),('a'), ('b'),('a'), ('b'), ('c');



DROP TABLE IF EXISTS item_children CASCADE;
CREATE TABLE IF NOT EXISTS item_children (
	id	SERIAL PRIMARY KEY,
	item_id INTEGER REFERENCES items(id),
	name	TEXT,
	tst TIMESTAMP DEFAULT NOW()
);

INSERT INTO item_children(name) VALUES ('a'), ('b'),('a'), ('b'),('a'), ('b'),('a'), ('b'), ('c');