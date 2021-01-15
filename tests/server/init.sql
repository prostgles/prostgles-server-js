


DROP TABLE IF EXISTS items CASCADE;
CREATE TABLE IF NOT EXISTS items (
	id	SERIAL PRIMARY KEY,
	-- id1 SERIAL,
	h		TEXT[],
	name	TEXT
	-- PRIMARY KEY(id, id1)
);

DROP TABLE IF EXISTS items2 CASCADE;
CREATE TABLE IF NOT EXISTS items2 (
	id	SERIAL PRIMARY KEY,
	items_id	INTEGER REFERENCES items(id),
	hh		TEXT[],
	name	TEXT
);

DROP TABLE IF EXISTS items3 CASCADE;
CREATE TABLE IF NOT EXISTS items3 (
	id	SERIAL PRIMARY KEY,
	h		TEXT[],
	name	TEXT
);


DROP TABLE IF EXISTS items4 CASCADE;
CREATE TABLE IF NOT EXISTS items4 (
	id			SERIAL,
	public	TEXT,
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



/*

SELECT 
"name", 
"h", 
"id", 
COALESCE(json_agg("items3_prostgles_json"::jsonb ORDER BY "items3_prostgles_rowid_sorted")   FILTER (WHERE "items3_prostgles_limit" <= 100 AND "items3_prostgles_dupes_rowid" = 1 AND "items3_prostgles_json" IS NOT NULL), '[]')  AS "items3", 
COALESCE(json_agg("items3_prostgles_json"::jsonb ORDER BY "items3_prostgles_rowid_sorted")   FILTER (WHERE "items3_prostgles_limit" <= 100 AND "items3_prostgles_dupes_rowid" = 1 AND "items3_prostgles_json" IS NOT NULL), '[]')  AS "items33"
FROM (
		SELECT *,
		row_number() over(partition by "items3_prostgles_dupes_rowid", ctid order by "items3_prostgles_rowid_sorted") AS items3_prostgles_limit, 
		row_number() over(partition by "items3_prostgles_dupes_rowid", ctid order by "items3_prostgles_rowid_sorted") AS items3_prostgles_limit
		FROM (
				SELECT 
					-- [source full sellect + ctid to group by]
				"items"."name","items"."h","items"."id","items"."ctid",
				"items3"."items3_prostgles_json", 
				"items3"."items3_prostgles_rowid_sorted"
				,"items3"."items3_prostgles_json", 
				"items3"."items3_prostgles_rowid_sorted"
				, row_number() over(partition by "items3_prostgles_rowid_sorted", "items".ctid ) AS "items3_prostgles_dupes_rowid"
				, row_number() over(partition by "items3_prostgles_rowid_sorted", "items".ctid ) AS "items3_prostgles_dupes_rowid"
				FROM (
						SELECT *, row_number() over() as ctid
						FROM "items"
						-- [source filter]
				) "items"
				LEFT JOIN "items2"
				ON "items"."name" = "items2"."name"
				LEFT JOIN    (
						SELECT *,
						row_number() over() as "items3_prostgles_rowid_sorted",
						row_to_json((select x from (SELECT "h", "name", "id") as x)) AS "items3_prostgles_json" 
						FROM (
								SELECT h, name, id 
								FROM "items3"
						) "items3"        -- [target table]
				) "items3"
				ON "items2"."name" = "items3"."name"

				LEFT JOIN "items2"
				ON "items"."name" = "items2"."name"
				LEFT JOIN (
						SELECT *,
						row_number() over() as "items3_prostgles_rowid_sorted",
						row_to_json((select x from (SELECT "h", "name", "id") as x)) AS "items3_prostgles_json" 
						FROM (
								SELECT h, name, id 
								FROM "items3"
						) "items3"        -- [target table]
				) "items3"

				ON "items2"."name" = "items3"."name"
		) t
) t
GROUP BY ctid, "name", "h", "id"
-- [source orderBy]   
	
-- [source limit] 
LIMIT 100
OFFSET 0



*/