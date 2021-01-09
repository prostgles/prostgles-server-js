import path from 'path';
import express from 'express';
// import prostgles from "../../dist/index";
import prostgles from "prostgles-server";
const app = express();
const http = require('http').createServer(app);
const io = require("socket.io")(http, { path: "/teztz/s" });
http.listen(3001);

import isomorphic from "../isomorphic_queries";
import server_only_queries from "../server_only_queries";

import { DBObj } from "./DBoGenerated";
// type DBObj = any;
import { DB, DbHandler } from 'prostgles-server/dist/Prostgles';

const stopTest = (err?) => {
	console.log("Stopping server ...")
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
		if(process.env.TEST_TYPE === "client"){
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
		getClientUser: async ({ sid }) => {
			const s = sessions.find(s => s.id === sid);
			if(!s) throw "err"
			const u = users.find(u => s && s.user_id === u.id);
			if(!u) throw "err"
			return { sid: s.id, uid: u.id };
		},
		getUser: async ({ sid }) => {
			const s = sessions.find(s => s.id === sid);
			if(!s) throw "err"
			return users.find(u => s && s.user_id === u.id);
		},
		login: async ({ username, password } = {}) => {
			const u = users.find(u => u.username === username && u.password === password);
			if(!u) throw "something went wrong: " + JSON.stringify({ username, password });
			let s = sessions.find(s => s.user_id === u.id)
			if(!s){
				s = { id: "SID" + Date.now(), user_id: u.id }
				sessions.push(s)
			}
			console.log("Logged in!")
			return { sid: s.id, expires: Infinity }
		}
	},
  publish: (socket, dbo: DBObj, db: DB, user: USER) => {
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
			}
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
      console.log(req.originalUrl)
			res.sendFile(path.join(__dirname+'/index.html'));
		}); 
		
		try { 
			 
			if(process.env.TEST_TYPE === "client"){
  
				console.log("(server): Waiting for client...");

				io.on("connection", socket => {
					console.log("(server): Client connected");
					socket.emit("start-test");
				});
			} else if(process.env.TEST_TYPE === "server"){

				await isomorphic(db);
				console.log("(server): Server isomorphic tests successful");
				await server_only_queries(db);
				console.log("(server): Server-only query tests successful");

				stopTest()
			} else {
				
				await db.items4.delete();
				await db.items4.insert([
					{ name: "abc", public: "public data", added: new Date('04 Dec 1995 00:12:00 GMT') },
					{ name: "abc", public: "public data", added: new Date('04 Dec 1995 00:12:00 GMT') },
					{ name: "abcd", public: "public data d", added: new Date('04 Dec 1996 00:12:00 GMT') }
				]);

				const MonAgg = await db.items4.find({ name: "abc" }, { select: { 
					name: 1,
					md5: { $md5_multi_agg: ["name", "public"] },
					// sha256: { $sha256_multi_agg: ["name", "public"] },
					// sha512: { $sha512_multi_agg: ["name", "public"] },
				} });
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