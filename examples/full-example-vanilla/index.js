const express = require('express');
const app = express();
const path = require('path');
var http = require('http').createServer(app);
var io = require('socket.io')(http, { path: "/teztz" });
http.listen(3001);

let prostgles = require('../../dist/index.js');


prostgles({
    dbConnection: {
        host: "localhost",
        port: "5432",
        user: process.env.PRGL_USER,
        password: process.env.PRGL_PWD
    },
    dbOptions: {
        application_name: "prostgles_api",
        max: 100,
        poolIdleTimeout: 10000
    },
    sqlFilePath: path.join(__dirname+'/init.sql'),
    
    io,
    
    onReady: async (dbo, db) => {
        try {
            // dbo.Events.subscribe({}, {}, console.log)
            // setTimeout(async ()=>{
            //     try {
            //     await dbo.Events.insert({ Id: 1 });
            //     await dbo.Events.insert({ Id: 21 });
            //     await dbo.Events.update({ Id: { $lt: 4 }}, { Id: 12 });
            //     await dbo.Events.delete({});

            //     } catch(err) {
            //         console.error(err)
            //     }
            // }, 1000);
            
        } catch(err) {
            console.error(err)
        }
        
        app.get('*', function(req, res){
			res.sendFile(path.join(__dirname+'/home.html'));
		});
    },

	publish: (socket, dbo) => {
        return {
            
            Points: {
                select: "*",
                insert: "*",
                update: "*",
                delete: "*",
                sync: {
                    synced_field: "Synced",
                    id_fields: ["id"]
                }
            }
        }
    },

    // publishMethods: ( socket, dbo) => { 

    //     return {
    //         upload: async (data) => {
    //             // let  tl = Date.now();
    //             //let res = await dbo.pixels.insert(data);
    //             // console.log(Date.now() - tl, "ms");
    //             console.log(data)// res;
    //             dbo.pixels.insert({ blb: data })
    //         }
    //     }
    // },
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