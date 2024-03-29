
import path from 'path';
import express from 'express';
import prostgles from "prostgles-server";
const app = express();
const http = require('http').createServer(app);
const { exec } = require('child_process');
import { testPublishTypes } from "./publishTypeCheck";
import { testPublish } from "./testPublish";
import { testDboTypes } from "./dboTypeCheck";
import { testTableConfig } from "./testTableConfig";

testDboTypes();
testPublishTypes();

const isClientTest = (process.env.TEST_TYPE === "client");
const io = !isClientTest? undefined : require("socket.io")(http, { path: "/teztz/s" });

http.listen(3001);

import { isomorphicQueries } from "../isomorphicQueries.spec";
import { serverOnlyQueries } from "../serverOnlyQueries.spec";

import { DBSchemaGenerated } from "./DBoGenerated";

import type { DBOFullyTyped } from "prostgles-server/dist/DBSchemaBuilder"; 
import { spawn } from "child_process";
export type { DBHandlerServer } from "prostgles-server/dist/Prostgles";

export const log = (msg: string, extra?: any, trace?: boolean) => {
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
  type: string;
}
const users: USER[] = [{ id: "1a", username: "john", password: "secret", type: "default" }];

process.on('unhandledRejection', (reason, p) => {
  console.trace('Unhandled Rejection at:', p, 'reason:', reason)
  process.exit(1)
});
/**
 * To create a superuser in linux:
 *    sudo su - postgres
 *    createuser api -s -P
 *    createdb prostgles_server_tests -O api
 */
const dbConnection = {
	host: process.env.POSTGRES_HOST || "localhost",
	port: +process.env.POSTGRES_PORT || 5432,
	database: process.env.POSTGRES_DB || "prostgles_server_tests",
	user: process.env.POSTGRES_USER || "api",
	password:  process.env.POSTGRES_PASSWORD || "api",
};

function dd(){
	
	const dbo: DBOFullyTyped<{ tbl: { is_view: true; columns: { col1: { type: number } } }}> = 1 as any
	if(!dbo) return;
	dbo.tbl.find;
}

prostgles<DBSchemaGenerated>({
	dbConnection,
	sqlFilePath: path.join(__dirname+'/../../init.sql'),
	io,
	tsGeneratedTypesDir: path.join(__dirname + '/../../'),
	transactions: true,
	schema: { public: 1, prostgles_test: 1 },
	onLog: async ev => {
		if(ev.type === "debug" || ev.type === "connect" || ev.type === "disconnect"){
			// log("onLog", ev);
		}
	},
	tableConfig: testTableConfig,
	fileTable: {
		referencedTables: {  
			users_public_info: {
				type: "column",
				referenceColumns: {
					avatar: {
						acceptedContent: "*"
					}
				}
			}
		},
		localConfig: {
			localFolderPath: path.join(__dirname+'/media'),
		},
		expressApp: app,
		tableName: "files",
	},
	restApi: {
		expressApp: app,
		routePrefix: "/api"
	},
	
	onSocketConnect:  ({ socket, db }) => {
		console.log("onSocketConnect", socket.id)
		if(isClientTest){
			log("Client connected -> console does not work. use log function. socket.id:", socket.id);
			socket.emit("start-test", { server_id: Math.random() });
			socket.on("log", async (data, cb) => { 
				console.log("Client log ", data);
			});
			socket.on("stop-test", async (err, cb) => {
				cb();
				console.log("Client test " + (!err? "successful" : "failed"));
				stopTest(err);
			});
		}
		
	},

	onSocketDisconnect:  ({ socket, db }) => {
		if(isClientTest){
			log("Client disconnected. socket.id:", socket.id);
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
						return { sid: s.id, user, clientUser: { sid: s.id, uid: user.id } }
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
		expressConfig: {
			app,
			onGetRequestOK(req, res, params) {
				log(req.originalUrl)
				res.sendFile(path.join(__dirname, '../../index.html'));
			},
		}
	},
	publishMethods: async (params) => {
		return {
			get: () => 222
		}
	},
	publish: testPublish, 
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
	onReady: async ({ dbo, db }) => {
		log("prostgles onReady");

		try {
			
			if(isClientTest){
				const execPath = path.resolve(`${__dirname}/../../../client`);
				/** For some reason the below doesn't work anymore */
				// const proc = spawn("npm", ["run", "test"], { cwd: execPath, stdio: "inherit" });
				
				spawn("node", ["dist/client/index.js"], { cwd: execPath, stdio: "inherit" });
				// const clientPath = `cd ${__dirname}/../../../clientz && npm test`;
				// const proc = exec(clientPath, console.log);
				// proc.stdout?.on('data', function(data) {
				// 	console.log(data); 
				// });
				// proc.stderr?.on('data', function(data) {
				// 	console.error(data); 
				// });
				log("Waiting for client...");
				
			} else if(process.env.TEST_TYPE === "server"){

				await serverOnlyQueries(dbo as any);
				log("Server-only query tests successful");
				await isomorphicQueries(dbo as any, log);
				log("Server isomorphic tests successful");

				stopTest()
			} 
		} catch(err) {
			console.trace(err)
			if(process.env.TEST_TYPE){
				stopTest(err ?? "Error")
			}
		}
		
	},
});