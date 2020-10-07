import path from 'path';
import express from 'express';
const prostgles = require("prostgles-server");
const app = express();
const http = require('http').createServer(app);
const io = require("socket.io")(http);
http.listen(3001);

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
	publish: (socket, dbo ) => "*",
	onReady: async (dbo, db) => {

	},
});
