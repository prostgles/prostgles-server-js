import express from 'express';
const app = express();
import path from 'path';
var http = require('http').createServer(app);

import * as socketio from "socket.io";
import { type, userInfo } from 'os';
var io = require("socket.io")(http);
http.listen(3000);
var fs = require('fs');

// import * as Prostgles from "../dist/index.js";
// Prostgles({ io, dbConnection: {  }})
// console.log(Prostgles({}));
// Prostgles({ })

var prostgles = require("../../dist/index");


// import prostgles from "prostgles-server";
// import prostgles from "../dist/index";
// import { TableHandler } from '../dist/DboBuilder';
// type DBObj = any;
import { DBObj } from "./DBoGenerated";
import { TableHandler } from 'prostgles-server/dist/DboBuilder';


prostgles({
    dbConnection: {
        host: "localhost",
        port: 5432,
        database: "example",
        user: process.env.PRGL_USER,
        password: process.env.PRGL_PWD
    },
    // dbOptions: {
    //     application_name: "prostgles_api",
    //     max: 100,
    //     poolIdleTimeout: 10000
    // },
    sqlFilePath: path.join(__dirname+'/init.sql'),
    
    io,
    tsGeneratedTypesDir: path.join(__dirname + '/'),
	publish: (socket, dbo ) => {
		// if(!socket || !socket._user.admin && !socket._user.id){
		// 	return false;
        // }

        return {
            pixels: {

                delete: "*",
                select: {
                    fields: { rgb: false }
                },
            }, 
            // sql_tables: {
            //     delete: "*",
            //     select: {
            //         fields: { rgb: false }
            //     },
            //     // update: "*"
            // }
        }
    },
    publishMethods: (socket, dbo: DBObj) => { 

        return {
            insertPixel: async (data) => {
                
                // let  tl = Date.now();
                let res = await (dbo.pixels).insert(data);
                // console.log(Date.now() - tl, "ms");
                return res;
            }
        }
    },
    
    isReady: async (dbo: DBObj) => {

        
        
        /* Benchmarking 10000 inserts */
        var tl = Date.now(), inserts = []
        for(var i = 0; i < 10000; i++){
            const data = { rgb: "black", xy: `${Math.random() * 400};${Math.random() * 400}` };
            inserts.push(data);
        }
        await dbo.pixels.insert(inserts);
        console.log(Date.now() - tl, "ms");
        
        const c = await dbo.pixels.count({});//.then(console.log);

        
        
		app.get('/', (req, res) => {
			res.sendFile(path.join(__dirname+'/home.html'));
        });
        
        app.get('*', function(req, res){
			res.status(404).send('Page not found');
		});
    },
	// onSocketConnect: async ({ socket, dbo }) => {
    //     /* Sending file */
    //     fs.readFile('home.html', function(err, buf){
    //         socket.emit('home', { image: true, buffer: buf });
    //     });

    //     return true;
    // },
	// onSocketDisconnect: async ({ socket, dbo }) => {
    //     return true;
    // },
    // auth: {
    //     login: (data, { socket, dbo }) => {},
    //     register: (data, { socket, dbo }) => {},
    //     logout: (data, { socket, dbo }) => {},
    //     onChange: (state, { socket, dbo }) => {},
    // },
});