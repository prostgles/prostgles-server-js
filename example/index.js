const express = require('express');
const app = express();
const path = require('path');
var http = require('http').createServer(app);
var io = require('socket.io')(http);
http.listen(3000);
var fs = require('fs');

let prostgles = require('../dist/index.js');

const mongo = require('mongodb').MongoClient
const url = 'mongodb://localhost:27017';


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
    joins: [
        { 
            tables: ["pixels", "colors"],
            on: { color_id: "id" },
            type: "one-one"
        },
        { 
            tables: ["drawings", "pixels"],
            on: { pixel_id: "id" },
            type: "one-many"
        },

        { 
            tables: ["users", "posts"],
            on: { id: "user_id" },
            type: "one-many"
        },
        { 
            tables: ["posts", "comments"],
            on: { id: "post_id" },
            type: "one-many"
        },
        { 
            tables: ["comments", "users"],
            on: { user_id: "id" },
            type: "many-one"
        }
    ],
    
    isReady: async (dbo, db) => {
        // await db.any(`VACUUM ANALYZE`);
            
        /* Benchmarking inserts */
        const TITLES = ["Wdwlkwdlkdaw", "Titlte tttt", "How to 2", "SresrjKJK!", "HDDSD "],
            CNTNT = ["hd dwadsd awd aw", "dad dawdadwa", "d aaa a a ", " dddddadwad"],
            USRN = ["user4534", "user453534", "user33grr", "user3252"];
        var tl = Date.now(), 
            pixels = [],
            drawings = [],
            colors = [],
            users = [],
            posts = [],
            comments = [],
            size = 1000;

        console.log(await dbo.comments.find({}, { limit: 2 }))
            // let _users = [], _posts = [], _comments = [];
            // for(var ii = 0; ii < 10; ii++){
            //     for(var i = 0; i < size; i++){
            //         // pixels.push({ rgb: ["red", "blue", "green"][Math.round(Math.random()*2)], xy: `${Math.random() * 400};${Math.random() * 400}`, color_id: 2 });
            //         // drawings.push({ pixel_id: Math.round(Math.random() * size) });
            //         // colors.push({ rgb: ["red", "blue", "green"][Math.round(Math.random()*2)] })
        
            //         _users.push({ username: USRN[Math.round(Math.random()*USRN.length - 1)]  })
            //         _posts.push({ user_id: Math.round(Math.random()*size - 1), title: TITLES[Math.round(Math.random()*TITLES.length - 1)] });
            //         _comments.push({ user_id: Math.round(Math.random()*size - 1), post_id: Math.round(Math.random()*size - 1), content: CNTNT[Math.round(Math.random()*CNTNT.length - 1)] });
            //     }
        
            //     // await dbo.pixels.insert(pixels);
            //     // await dbo.drawings.insert(drawings);
            //     // await dbo.colors.insert(colors);
        
            //     _posts.push({ user_id: 1, title: ";this da one"});
            //     _posts.push({ user_id: 1, title: ";this anodar one"});
            //     _posts.push({ user_id: 1, title: "zzz"});
            //     // comments.push({ user_id: 1, post_id: 1, content: "pull up pull up" });
            
        
            //     await dbo.users.insert(_users);
            //     await dbo.posts.insert(_posts);
            //     await dbo.comments.insert(_comments);
            //     // await users.insertMany(_users);
            //     // await posts.insertMany(_posts);
            //     // await comments.insertMany(_comments);

            //     console.log(Date.now() - tl, "ms");
            //     _users = [];
            //      _posts = [];
            //      _comments = [];
            // }

        // mongo.connect(url, {
        //     useNewUrlParser: true,
        //     useUnifiedTopology: true
        //     }, async (err, client) => {
        //         console.log(22222);
        //         if (err) {
        //         console.error(err)
        //         return
        //         }


        //         const db = client.db('stw');

        //         const users = db.collection('users');
        //         const posts = await db.collection('posts');
        //         const comments = db.collection('comments');
        //         await posts.drop();
        //         await dbo.posts.delete({});

        //         // await posts.insertOne({ user_id: 1, title: ";this da one"});
        //         // await posts.insertOne({ user_id: 1, title: ";this anodar one"});
        //         // await posts.insertOne({ user_id: 1, title: "zzz"});
                

        //         // console.time("mongo")
        //         // let mRes = await posts.countDocuments({ $or: [{ title: /ttt/ }, { user_id: { $in: [1,2,3,4,5,6,6,7,8,95,6]} } ]});//, { projection: { user_id: 1, title: 1, _id: 0 } }).sort({ user_id: -1, title: -1 }).limit(100).toArray();
        //         // console.timeEnd("mongo");
        //         // console.log(mRes, await posts.countDocuments());
                

        //         // console.time("pro")
        //         // let pRes = await dbo.posts.count({ $or: [ {title: { $ilike: '%ttt%'}}, { user_id: { $in: [1,2,3,4,5,6,6,7,8,95,6]} } ] });//, { select: { user_id: 1, title: 1 }, orderBy: { user_id: false, title: false }});
        //         // console.timeEnd("pro");
        //         // console.log(pRes, await dbo.posts.count({}));
                
        //         // console.log("posts count ", await posts.countDocuments());
        // });

        // console.time("qqq")
        // let res = await db.any(q);
        // console.timeEnd("qqq");
        // console.log(res)

        // console.log(JSON.stringify(res, null, 2));
        // console.log(q);


        
		app.get('/', (req, res) => {
			res.sendFile(path.join(__dirname+'/home.html'));
        });
        
        app.get('*', function(req, res){
			res.status(404).send('Page not found');
		});
    },

	publish: (socket, dbo) => {
        return {
            points: {
                select: "*",
                insert: "*",
                delete: "*",
                update: "*",
                sync: {
                    synced_field: "synced",
                    id_fields: ["id"],
                    allow_delete: true
                }
            },
            pixels: {
                select: {
                    fields: "*"
                },
                insert: {
                    fields: {
                        rgb: 1,
                        xy: 1
                    }
                },
                update: {
                    fields: "*",
                    // forcedData: { rgb: 2, id: 2 }
                },
                delete: "*"
            }, 
            // drawings: "*",
            // users: "*",
            // posts: "*",
            // comments: "*"
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