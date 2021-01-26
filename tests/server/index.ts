
import path from 'path';
import express from 'express';
import prostgles from "prostgles-server";
const app = express();
const http = require('http').createServer(app);

const clientTest = (process.env.TEST_TYPE === "client");
const io = !clientTest? undefined : require("socket.io")(http, { path: "/teztz/s" });

http.listen(3001);

import isomorphic from "../isomorphic_queries";
import server_only_queries from "../server_only_queries";

import { DBObj } from "./DBoGenerated";
// type DBObj = any;
import { DB, DbHandler } from 'prostgles-server/dist/Prostgles';

const log = (msg: string, extra?: any) => {
  console.log(...["(server): " + msg, extra].filter(v => v));
}
const stopTest = (err?) => {
	log("Stopping server ...")
	if(err) console.error(err);
	process.exit(err? 1 : 0);
}

const sessions: { id: string, user_id: string }[] = [];
type USER = { 
	id: string; 
	username: string; 
	password: string; 
}
const users: USER[] = [{ id: "1a", username: "john", password: "secret" }];

prostgles({
	dbConnection: {
		host: process.env.POSTGRES_HOST || "localhost",
		port: +process.env.POSTGRES_PORT || 5432,
		database: process.env.POSTGRES_DB || "postgres",
		user: process.env.POSTGRES_USER || "api",
		password:  process.env.POSTGRES_PASSWORD || "api"
	},
	sqlFilePath: path.join(__dirname+'/init.sql'),
	io,
	tsGeneratedTypesDir: path.join(__dirname + '/'),
	watchSchema: true,
	transactions: true,
	onSocketConnect: (socket) => {
		log("onSocketConnect")
		if(clientTest){
			log("Client connected");
			socket.emit("start-test", { server_id: Math.random() });
			socket.on("stop-test", (err, cb) => {
				cb();
				stopTest(err)
			});
		}
		return true;
	},
	// DEBUG_MODE: true,
	
  publishRawSQL: async (socket, dbo: DBObj, db: DB, user: USER) => {
    return true;// Boolean(user && user.type === "admin")
  },
	auth: {
		sidQueryParamName: "token",
		getClientUser: async ({ sid }) => {
			if(sid){
				const s = sessions.find(s => s.id === sid);
				if(s){
					const u = users.find(u => s && s.user_id === u.id);
					if(u) return { sid: s.id, uid: u.id };
				}
			}
			return null;
		},
		getUser: async ({ sid }) => {
			if(sid){
				const s = sessions.find(s => s.id === sid);
				if(s) return users.find(u => s && s.user_id === u.id);
			}
			return null;
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
			return { sid: s.id, expires: Infinity }
		}
	},
  publish: async (socket, dbo: DBObj, db: DB, user: USER) => {
		// return "*";
		return  {
			items: "*",
			items2: "*",
			items3: "*",
			v_items: "*",
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
					forcedFilter: { name: "abc" }
				},
				insert: "*",
				delete: "*"
			},

			items4_pub: "*"
		};
		
		// return {
		// 	items: {
		// 		select: {
		// 			fields: "*",
		// 			forcedFilter: {
		// 				$exists: { items3: { name: "a" } }
		// 			}
		// 		}
		// 	}
		// };
	},
	// joins: "inferred",
	joins: [
		{ 
			tables: ["items", "items2"],
			on: { name: "name" },
			type: "many-many"
		},
		{ 
			tables: ["items2", "items3"],
			on: { name: "name" },
			type: "many-many"
		}
	],
	onReady: async (db: DbHandler, _db: DB) => {
		   
    app.get('*', function(req, res){
      log(req.originalUrl)
			res.sendFile(path.join(__dirname+'/index.html'));
		}); 
		
		try { 
			 
			if(process.env.TEST_TYPE === "client"){
				log("Waiting for client...");
				
			} else if(process.env.TEST_TYPE === "server"){

				await isomorphic(db);
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

				const v1 = await db.items.insert([{ name: "a" }, { name: "z" }, { name: "b" }]);
				// v1.a;
				await db.items2.insert([{ name: "a", items_id: 1 }]);
				await db.items2.insert([{ name: "a", items_id: 1 }]);
				await db.items2.insert([{ name: "b", items_id: 2 }]);
				await db.items2.insert([{ name: "b", items_id: 2 }]);
				await db.items2.insert([{ name: "b", items_id: 2 }]);
				await db.items3.insert([{ name: "a" }, { name: "za123" }]);
				const MonAgg = await db.items.find({}, { select: { 
					name: 1,
					items2: { count: { $count: ["id"] } } ,
				} });
				console.log(JSON.stringify(MonAgg, null, 2))
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


function randElem(items){
	return items[Math.floor(Math.random() * items.length)];
}