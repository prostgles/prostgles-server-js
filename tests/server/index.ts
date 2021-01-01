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
	
  publishRawSQL: async (socket, dbo: DBObj, db: DB, user: any) => {
    return true;// Boolean(user && user.type === "admin")
  },
  publish: (socket, dbo: DBObj) => {
		// return "*";
		return  {
			items: "*",
			items2: "*",
			items3: "*",
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

				console.log("Waiting for client...")
				io.on("connection", socket => {
					socket.emit("start-test");
					console.log("Client connected");
				});
			} else if(process.env.TEST_TYPE === "server"){

				await isomorphic(db);
				console.log("Server isomorphic tests successful");
				await server_only_queries(db);
				console.log("Server-only query tests successful");

				stopTest()
			}


		} catch(err) {
			stopTest(err)
    }
    
	},
});


function randElem(items){
	return items[Math.floor(Math.random() * items.length)];
}