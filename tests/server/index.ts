
import path from 'path';
import express from 'express';
import prostgles from "prostgles-server";
const app = express();
const http = require('http').createServer(app);
const { exec } = require('child_process');
import { testPublishTypes } from "./publishTypeCheck";

import { testDboTypes } from "./dboTypeCheck";
testDboTypes();
testPublishTypes();

const clientTest = (process.env.TEST_TYPE === "client");
const io = !clientTest? undefined : require("socket.io")(http, { path: "/teztz/s" });

http.listen(3001);

import isomorphic from "../isomorphic_queries";
import server_only_queries from "../server_only_queries";

import { DBSchemaGenerated } from "./DBoGenerated";
// type DBObj = any;

import { TableConfig } from '../../dist/TableConfig';
import { DBOFullyTyped } from "../../lib/DBSchemaBuilder";
import { PublishFullyTyped } from "../../dist/DBSchemaBuilder";

const log = (msg: string, extra?: any, trace?: boolean) => {
	const msgs = ["(server): " + msg, extra].filter(v => v);
	if(trace){
		console.trace(...msgs);
	} else {
		console.log(...msgs);
	}
}
const stopTest = (err?) => {
	log("Stopping server ...")
	if(err) {
		console.trace(err);
	}
	process.exit(err? 1 : 0);
}

const sessions: { id: string, user_id: string }[] = [];
type USER = { 
	id: string; 
	username: string; 
	password: string; 
}
const users: USER[] = [{ id: "1a", username: "john", password: "secret" }];

process.on('unhandledRejection', (reason, p) => {
  console.trace('Unhandled Rejection at:', p, 'reason:', reason)
  process.exit(1)
});

const dbConnection = {
	host: process.env.POSTGRES_HOST || "localhost",
	port: +process.env.POSTGRES_PORT || 5432,
	database: process.env.POSTGRES_DB || "postgres",
	user: process.env.POSTGRES_USER || "api",
	password:  process.env.POSTGRES_PASSWORD || "api",
	// user: "usr",
	// password:  "usr",
};

function dd(){
	
	const dbo: DBOFullyTyped<{ tbl: { is_view: true; columns: { col1: { type: number } } }}> = 1 as any
	if(!dbo) return;
	dbo.tbl.find

}

(async () => {


	log("created prostgles")
	const tableConfig: TableConfig<{ en: 1, fr: 1 }> = {

		tr2: {
			// dropIfExists: true,
			columns: {
				t1: { label: { fr: "fr_t1" }, info: { hint: "hint...", min: "a", max: "b" } },
				t2: { label: { en: "en_t2" } },
			},
			triggers: {
				atLeastOneA: {
					actions: ["delete", "update"],
					forEach: "statement",
					type: "after",
					query: `
						DECLARE
						x_rec record;
						BEGIN

							IF NOT EXISTS(SELECT * FROM tr2 WHERE t1 = 'a' AND t2 = 'b') THEN
								RAISE EXCEPTION 'Must have at least one row with t1 = a AND t2 = b';
							END IF;

							RETURN NULL;
						END;
					`
				}
			}
		},
		users: {
			dropIfExists: true,
      columns: {
        id:           { sqlDefinition: `SERIAL PRIMARY KEY ` },
        email:        { sqlDefinition: `TEXT NOT NULL` },
        status:       { enum: ["active", "disabled", "pending"] },
        preferences:  { defaultValue: "{}", 
          jsonbSchema: { 
            showIntro:  { type: "boolean", optional: true },
            theme:      { enum: ["light", "dark", "auto"], optional: true },
						others: 		{ type: "any[]" }
          } 
        },
      }
    },
		tjson: {
			dropIfExists: true,
			columns: {
				json: { jsonbSchema: { 
						a: { type: "boolean" },
						arr: { enum: ["1", "2", "3"] },
						arr1: { enum: [1, 2, 3] },
						arr2: { type: "integer[]" },
						arrStr: { type: "string[]", optional: true, nullable: true },
						o: { oneOf: [{ o1: { type: "integer" } }, { o2: { type: "boolean" } }], optional: true, nullable: true },
					}  
				},
				colOneOf: { enum: ["a", "b", "c"] },
				status:  {
					nullable: true, 
					jsonbSchema: {
						oneOf: [
							{ ok: { type: "string" } },
							{ err: { type: "string" } },
							{ 
								loading: { type: { 
									loaded: { type: "number" },
									total: { type: "number" } 
									} 
								} 
							}
						]
					}
				},
				jsonOneOf: { 
					nullable: true, 
					jsonbSchema: { 
						oneOf: [
							{ command: { enum: ["a"] } },
							{ 
								command: { enum: ["b"] },
								option: { type: "integer[]" }
							}
						]
					}
				},
				table_config:        {
        nullable: true,
        jsonbSchema: {
          referencedTables: { type: {}, optional: true },
				}}
			}
		},
		lookup_col1: {
			dropIfExists: true, 
			isLookupTable: {
				values: {
					a: {},
					b: {}
				},
			}
		},
		uuid_text: {
			columns: {
				col1: {
					references: {
						tableName: "lookup_col1",
						nullable: true,
					}
				},
				col2: {
					references: {
						tableName: "lookup_col1",
						nullable: true,
					}
				}
			}
		},
		rec_ref: {
			columns: {
				id: "SERIAL PRIMARY KEY",
			}
		},
		rec: {
			columns: {
				id: "SERIAL PRIMARY KEY",
				parent_id: "INTEGER REFERENCES rec",
				recf: "INTEGER REFERENCES rec_ref",
			}
		}
	} 
	// ProstglesInitOptions<DBSchemaGenerated>
	let prgl = await prostgles<DBSchemaGenerated>({
		dbConnection,
		sqlFilePath: path.join(__dirname+'/init.sql'),
		io,
		tsGeneratedTypesDir: path.join(__dirname + '/'),
		// watchSchema: true,
		transactions: true,

		// DEBUG_MODE: true,
		// onNotice: console.log,
		tableConfig,
		fileTable: {
			// awsS3Config: {
			//   accessKeyId: process.env.S3_KEY,
			//   bucket: process.env.S3_BUCKET,
			//   region: process.env.S3_REGION,
			//   secretAccessKey: process.env.S3_SECRET,
			// },
			referencedTables: {
				items_with_one_media: "one",
				items_with_media: "many",
			},
			localConfig: {
			  localFolderPath: path.join(__dirname+'/media'),
			},
			expressApp: app,
		},

		onSocketDisconnect:  (socket, db) => {
			log("onSocketDisconnect")
			console.trace("onSocketDisconnect");
			// const c: DBOFullyTyped<DBSchemaGenerated> = 1 as any;
			// c["*"].
		},
		
		onSocketConnect:  (socket, db) => {
			log("onSocketConnect")
			if(clientTest){
				log("Client connected -> CLIENT ERRORS ARE NOT LOGGED HERE!");
				socket.emit("start-test", { server_id: Math.random() });
				socket.on("stop-test", async (err, cb) => {
					cb();
					if(!err){
						console.log("Client test successful!")
					}

					// console.log("Destroying prgl");
					// await db.items.subscribe({}, {}, () => {});

					// await prgl.destroy();
					// console.log("Recreating prgl")
					// prgl = await prostgles({
					// 	dbConnection,
					// 	onReady: async (dbo) => {
					// 		console.warn("onReady", await dbo.items.count())
					// 		// await tout(2)
					// 		await prgl.destroy();
					// 		console.log("Recreating prgl")
					// 		prgl = await prostgles({
					// 			dbConnection,
					// 			onReady: async (dbo) => {
					// 				console.warn("onReady", await dbo.items.count())
					// 			}
					// 		});
					// 	}
					// });

					stopTest(err);
				});
			}
			
		},
		
		publishRawSQL: async (params) => {
			return true;// Boolean(user && user.type === "admin")
		},
		auth: {
			sidKeyName: "token",
			getUser: async (sid) => {
				if(sid){
					const s = sessions.find(s => s.id === sid);
					if(s) {
						const user = users.find(u => s && s.user_id === u.id);
						if(user) {
							return { user, clientUser: { sid: s.id, uid: user.id } }
						}
					}
				}
				return undefined;
			},
			login: async ({ username, password } = {}) => {
				const u = users.find(u => u.username === username && u.password === password);
				if(!u) throw "something went wrong: " + JSON.stringify({ username, password });
				let s = sessions.find(s => s.user_id === u.id)
				if(!s){
					s = { id: "SID" + Date.now(), user_id: u.id }
					sessions.push(s)
				}
				log("Logged in!")
				return { sid: s.id, expires: Infinity, onExpiration: "redirect" }
			},
			cacheSession: {
				getSession: async (sid) => { 
					const s = sessions.find(s => s.id === sid); 
					return s? { sid: s.id, expires: Infinity, onExpiration: "redirect" }  : undefined
				}
			},
		},
		publishMethods: async (params) => {
			return {
				get: () => 222
			}
		},
		publish: async ({ user }) => {
			const res: PublishFullyTyped<DBSchemaGenerated> =  {
				shapes: "*",
				items: "*",
				items2: "*",
				items3: "*",
				items4a: "*",
				tjson: "*",
				// items_with_media_cols: "*",
				items_multi: "*",
				v_items: "*",
				various: "*",
				tr1: "*",
				tr2: "*",
				planes: {
					select: "*",
					update: "*",
					insert: "*",
					delete: "*",
					sync: {
						id_fields: ["id"],
						synced_field: "last_updated"
					}
				},

				items4: {
					select: user? "*" : {
						fields: { name: 0 },
						orderByFields: { added: 1 },
						forcedFilter: { name: "abc" }
					},
					insert: "*",
					update: "*",
					delete: "*"
				},

				items4_pub: "*",
				"*": {
					select: { fields: { "*": 0 }},
					insert: "*",
					update: "*",
				},
				[`"*"`]: {
					select: { fields: { [`"*"`]: 0 }},
					insert: "*",
					update: "*",
				},
				obj_table: "*",
				media: "*",
				items_with_one_media: "*",
				items_with_media: "*",
				prostgles_lookup_media_items_with_one_media: "*",
				prostgles_lookup_media_items_with_media: "*",
				insert_rules: {
					select: "*",
					insert: {
						fields: "*",
						returningFields: { name: 1 },
						validate: async (row) => {
							if(row.name === "a") row.name = "b"
							return row
						},
						postValidate: async (row, dboTx) => {
							/** Records must exist in this transaction */
							log(JSON.stringify(row))
							const exists = await dboTx.sql("SELECT * FROM insert_rules WHERE id = ${id}", row, { returnType: "row" });
							const existsd = await dboTx.insert_rules.findOne({ id: row.id });
							if(row.id !== exists.id || row.id !== existsd.id){
								console.error("postValidate failed");
								// process.exit(1) 
							}
							if(row.name === "fail") throw "Failed";
							return undefined
						}
					}
				},
				uuid_text: {
					insert: {
						fields: "*",
						forcedData: {
							id: 'c81089e1-c4c1-45d7-a73d-e2d613cb7c3e'
						}
					},
					update: {
						fields: [],
						dynamicFields: [{
							fields: { id: 1 },
							filter: {
								id: 'c81089e1-c4c1-45d7-a73d-e2d613cb7c3e'
							}
						}]
					}
				}
			};
			
			return res;
		},
		// joins: "inferred",
		joins: [
			{ 
				tables: ["items", "items2"],
				on: [{ name: "name" }],
				type: "many-many"
			},
			{ 
				tables: ["items2", "items3"],
				on: [{ name: "name" }],
				type: "many-many"
			},
			{ 
				tables: ["items4a", "items"],
				on: [{ items_id: "id" }],
				type: "many-many"
			},
			{ 
				tables: ["items4a", "items2"],
				on: [{ items2_id: "id" }],
				type: "many-many"
			},
			{ 
				tables: ["items_multi", "items"],
				on: [
					{ items0_id: "id" },
					{ items1_id: "id" },
					{ items2_id: "id" },
					{ items3_id: "id" },
				],
				type: "many-many"
			}

			
		],
		onReady: async (db, _db) => {
			log("prostgles onReady")
			app.get('*', function(req, res){
				log(req.originalUrl)
				res.sendFile(path.join(__dirname+'/index.html'));
			});
		

			try {
				
				if(process.env.TEST_TYPE === "client"){
					const clientPath = `cd ${__dirname}/../client && npm test`;
					log("EXEC CLIENT PROCESS")
					const proc = exec(clientPath, console.log);
					log("Waiting for client...");
					proc.stdout.on('data', function(data) {
						console.log(data); 
					});
					proc.stderr.on('data', function(data) {
						console.error(data); 
					});
					
				} else if(process.env.TEST_TYPE === "server"){

					await isomorphic(db as any);
					log("Server isomorphic tests successful");
					await server_only_queries(db);
					log("Server-only query tests successful");

					stopTest()
				} else {
					// await db.items4.delete();
					// await db.items4.insert([
					// 	{ name: "abc", public: "public data", added: new Date('04 Dec 1995 00:12:00 GMT') },
					// 	{ name: "abc", public: "public data", added: new Date('04 Dec 1995 00:12:00 GMT') },
					// 	{ name: "abcd", public: "public data d", added: new Date('04 Dec 1996 00:12:00 GMT') }
					// ]);

					// const v1 = await db.items.insert([{ name: "a" }, { name: "z" }, { name: "b" }]);
					// await db.items2.insert([{ name: "a", items_id: 1 }]);
					// await db.items2.insert([{ name: "a", items_id: 1 }]);
					// await db.items2.insert([{ name: "b", items_id: 2 }]);
					// await db.items2.insert([{ name: "b", items_id: 2 }]);
					// await db.items2.insert([{ name: "b", items_id: 2 }]);
					// await db.items3.insert([{ name: "a" }, { name: "za123" }]);
					// const MonAgg = await db.items.find({}, { select: { 
					// 	name: 1,
					// 	items2: { count: { $count: ["id"] } } ,
					// } });
					// console.log(JSON.stringify(MonAgg, null, 2));

					// await _db.any("DROP TABLE IF EXISTS tt; ")
					// await _db.any("DROP TABLE IF EXISTS tt; CREATE TABLE tt(id serial);")
					// await _db.any("DROP EXTENSION IF EXISTS pgcrypto; CREATE EXTENSION pgcrypto;")
					// console.log(await db.items4.findOne({}, { select: { public: { "$ts_headline": ["public", "public"] } } }))
				}

			} catch(err) {
				console.trace(err)
				if(process.env.TEST_TYPE){
					stopTest(err)
				}
			}
			
		},
	});

})()

function randElem(items){
	return items[Math.floor(Math.random() * items.length)];
}

async function tout(millis){
	return new Promise((re, rj) => {
		setTimeout(() => {
			re(true);
		}, millis)
	})
}
