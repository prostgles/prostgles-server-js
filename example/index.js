const express = require('express');
const app = express();
const path = require('path');
var http = require('http').createServer(app);
var io = require('socket.io')(http);
http.listen(3000);
var fs = require('fs');

let prostgles = require('../index.js');

prostgles.init({
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
    
    ioObj: io,
	publish: ({ socket, dbo }) => {
		// if(!socket || !socket._user.admin && !socket._user.id){
		// 	return false;
        // }
        
        return {
            pixels: "*", 
        }
    },
    publishMethods: ({ socket, dbo }) => { 

        return {
            insertPixel: async (data) => {
                // let  tl = Date.now();
                let res = await dbo.pixels.insert(data);
                // console.log(Date.now() - tl, "ms");
                return res;
            }
        }
    },
    
    isReady: async (dbo) => {
            
        /* Benchmarking */
        var tl = Date.now(), inserts = []
        for(var i = 0; i < 10000; i++){
            const data = { rgb: "black", xy: `${Math.random() * 400};${Math.random() * 400}` };
            inserts.push(data);
        }
        await dbo.pixels.insert(inserts).then(console.log);


        
        // let subs = []
        // for(let i = 0; i < 100; i++){
        //     let sub = dbo.pixels.subscribe({ }, {}, (data) => {
        //         console.log(i, data.length)
        //     });
        //     console.log(sub)
        //     subs.push(sub)
        // }

        // setTimeout(() => {
        //     subs.map((s, i)=> {
        //         if(i > 0) s.unsubscribe();
        //     })
        // }, 1000)

        // await Promise.all(inserts.map(dbo.pixels.insert));   , { returning: "" }
        // await dbo.pixels.update(inserts.map((d, i) => [{ id: i}, d]));      
        console.log(Date.now() - tl, "ms");
        dbo.pixels.remove({});
        dbo.pixels.count({}).then(console.log);


		app.get('/prostgles-client-js/index.js', (req, res) => {
            
			var allowedOrigins = ['http://localhost:6969', 'https://prostgles.com'];
			var origin = req.headers.origin;
			if(allowedOrigins.indexOf(origin) > -1){
				res.setHeader('Access-Control-Allow-Origin', origin);
			}
			res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
			res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
			res.header('Access-Control-Allow-Credentials', true);

			res.sendFile(path.join(__dirname+'/../../prostgles-client-js/index.js'));
		});
        
		app.get('/', (req, res) => {
			res.sendFile(path.join(__dirname+'/home.html'));
        });
        
        app.get('*', function(req, res){
			res.status(404).send('Page not found');
		});
    },
	onSocketConnect: async ({ socket, dbo }) => {
        fs.readFile('home.html', function(err, buf){
            // it's possible to embed binary data
            // within arbitrarily-complex objects
            socket.emit('home', { image: true, buffer: buf });
        });

        return true;
    },
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