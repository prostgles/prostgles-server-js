import path from 'path';
import express from 'express';
// const prostgles = require("prostgles-server");
import prostgles from "../../../dist/index";
const app = express();
const http = require('http').createServer(app);
const io = require("socket.io")(http);
http.listen(3001);

import { DBObj } from "./DBoGenerated";
import { TableHandler, DbHandler } from '../../../dist/DboBuilder';

prostgles({
	dbConnection: {
		host: "localhost",
		port: 5432,
		database: "postgres",
		user: process.env.PRGL_USER,
		password: process.env.PRGL_PWD
	},
	sqlFilePath: path.join(__dirname+'/init.sql'),
	io,
	tsGeneratedTypesDir: path.join(__dirname + '/'),
	transactions: "tt",
	publish: (socket, dbo: DBObj) => {
		
		return {};
	},
	onReady: async (dbo: DBObj, db) => {
		await db.any(`CREATE TABLE IF NOT EXISTS "table" (id text);`)
		await dbo.items.delete({});

		/* Transaction example */
		dbo.tt(async t => {
			const r = await t.items.insert({ name: "tr" }, { returning: "*" });
			console.log(r);
			console.log(await t.items.find());
			throw "err"; // Any errors will revert all data-changing commands using the transaction object ( t )
		});
		console.log(await dbo.items.find());// Item not present due to transaction block error
	},
});
