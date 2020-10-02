const express = require('express');
const app = express();
const path = require('path');
const { join } = require('path');
var http = require('http').createServer(app);
var io = require('socket.io')(http);
http.listen(3000);

let prostgles = require('prostgles-server');

/* Serve react files */
app.use(express.static(join(__dirname, "../client/build")));

prostgles({
    dbConnection: {
        host: "localhost",
        port: "5432",
        user: process.env.PRGL_USER,
        password: process.env.PRGL_PWD
    },
    sqlFilePath: path.join(__dirname+'/init.sql'),
	publish: (socket, dbo) => {
        return {
            items: {
                select: "*",
                insert: "*",
                update: "*",
                delete: "*",
                sync: {
                    id_fields: ["id"],
                    synced_field: "synced"
                }
            }
        }
    },
    
    io,    
    onReady: async (dbo, db) => {

    },

});