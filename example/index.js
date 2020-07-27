const express = require('express');
const app = express();
const path = require('path');
var http = require('http').createServer(app);
var io = require('socket.io')(http);
http.listen(3000);
var fs = require('fs');

let prostgles = require('../dist/index.js');

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
            comments = [];
        for(var i = 0; i < 1000; i++){
            pixels.push({ rgb: ["red", "blue", "green"][Math.round(Math.random()*2)], xy: `${Math.random() * 400};${Math.random() * 400}`, color_id: 2 });
            drawings.push({ pixel_id: Math.round(Math.random() * 1000) });
            colors.push({ rgb: ["red", "blue", "green"][Math.round(Math.random()*2)] })

            users.push({ username: USRN[Math.round(Math.random()*USRN.length - 1)]  })
            posts.push({ user_id: Math.round(Math.random()*1000 - 1), title: TITLES[Math.round(Math.random()*TITLES.length - 1)] });
            comments.push({ user_id: Math.round(Math.random()*1000 - 1), post_id: Math.round(Math.random()*1000 - 1), content: CNTNT[Math.round(Math.random()*CNTNT.length - 1)] });
        }

        await dbo.pixels.insert(pixels);
        await dbo.drawings.insert(drawings);
        await dbo.colors.insert(colors);

        posts.push({ user_id: 1, title: ";this da one"});
        posts.push({ user_id: 1, title: ";this anodar one"});
        posts.push({ user_id: 1, title: "zzz"});
        comments.push({ user_id: 1, post_id: 1, content: "pull up pull up" });
    

        await dbo.users.insert(users);
        await dbo.posts.insert(posts);
        await dbo.comments.insert(comments);
        console.log(Date.now() - tl, "ms");


        let q = await (dbo.users.buildJoinQuery({ 
            select: ["id", "username"],
            allFields: dbo.users.column_names,
            table: "users",
            where: "id = 1",
            limit: 5,
            offset: 0,
            orderBy: ["id"],
            isLeftJoin: true,
            joins: [
                {
                    select: ["id", "title", "user_id"],
                    allFields: dbo.posts.column_names,
                    table: "posts",
                    where: "true or title ilike '%one%'",
                    limit: 4,
                    offset: 0,
                    orderBy: ["true"],
                    isLeftJoin: true,
                    joins: [
                        {
                            select: ["id", "username"],
                            allFields: dbo.users.column_names,
                            table: "users",
                            where: "id = 1",
                            limit: 1,
                            offset: 0,
                            orderBy: ["id"],
                            isLeftJoin: true,
                            joins: [
                                {
                                    select: ["id","content"],
                                    allFields: dbo.comments.column_names,
                                    table: "comments",
                                    where: "id IS NOT NULL",
                                    limit: 2,
                                    offset: 0,
                                    orderBy: ["id desc"],
                                    isLeftJoin: true
                                }
                            ]
                        }


                        // {
                        //     select: ["id","content"],
                        //     allFields: dbo.comments.column_names,
                        //     table: "comments",
                        //     where: "id IS NOT NULL",
                        //     limit: 2,
                        //     offset: 0,
                        //     orderBy: ["true"],
                        //     isLeftJoin: true
                        // }
                    ]
                }
            ]
        }));

        // let q = await (dbo.users.buildJoinQuery({ 
        //     select: ["id", "username"],
        //     allFields: dbo.users.column_names,
        //     table: "users",
        //     where: "id = 1",
        //     limit: 5,
        //     offset: 0,
        //     orderBy: ["id"],
        //     isLeftJoin: true,
        //     joins: [
        //         {
        //             select: ["id", "title", "user_id"],
        //             allFields: dbo.posts.column_names,
        //             table: "posts",
        //             where: "TRUE",
        //             limit: 5,
        //             offset: 0,
        //             orderBy: ["id"],
        //             isLeftJoin: true,
        //             joins: [
        //                 {
        //                     select: ["id","content"],
        //                     allFields: dbo.comments.column_names,
        //                     table: "comments",
        //                     where: "id IS NOT NULL",
        //                     limit: 2,
        //                     offset: 0,
        //                     orderBy: ["id desc"],
        //                     isLeftJoin: true
        //                 }
        //             ]
        //         }
        //     ]
        // }));
        console.time("qqq")
        let res = await db.any(q);
        console.timeEnd("qqq")
        console.log(JSON.stringify(res, null, 2));


        // db.any(`
        // select users.username 
        // ,json_agg((
        //         posts.*
        // )) FILTER (WHERE posts.ctid IS NOT NULL) as posts
        // from users
        // left join (
        //         SELECT posts.ctid, posts.user_id , posts.id, posts.title, json_agg((comments.*)) FILTER (WHERE comments.ctid IS NOT NULL) as comments
        //         FROM posts
        //         left join comments
        //         on posts.id = comments.post_id
        //         group by  posts.ctid, posts.id, posts.title, posts.user_id
        // ) posts
        // on users.id = posts.user_id
        // group by users.ctid, users.username LIMIT 10`).then(console.log)

        // db.any(`
        // select p.id
        // --, case when json_agg(c.*)::text = '[null]' then '[]' else json_agg(c.*) end as colors
        // , row_to_json((c.*)) as colors
        // from pixels p
        // left join colors c
        // on p.rgb = c.rgb
        // --group by p.id
        // limit 10
        // `).then(console.log)
        
        // dbo.colors.insert([{ rgb: "black" }, { rgb: "black"}, { rgb: "green"}, { rgb: "green"}, { rgb: "green"}]);
        
        // dbo.pixels.count({}).then(console.log);

        
		app.get('/', (req, res) => {
			res.sendFile(path.join(__dirname+'/home.html'));
        });
        
        app.get('*', function(req, res){
			res.status(404).send('Page not found');
		});
    },

	publish: ({ socket, dbo }) => {        
        return {
            pixels: {
                select: {
                    fields: {
                        rgb: 1
                    }
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
                // delete: "*"
            }, 
        }
    },

    publishMethods: ({ socket, dbo }) => { 

        return {
            upload: async (data) => {
                // let  tl = Date.now();
                //let res = await dbo.pixels.insert(data);
                // console.log(Date.now() - tl, "ms");
                console.log(data)// res;
                dbo.pixels.insert({ blb: data })
            }
        }
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