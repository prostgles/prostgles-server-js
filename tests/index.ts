import path from 'path';
import express from 'express';
// import prostgles from "prostgles-server";
import prostgles from "../dist/index";
const app = express();
const http = require('http').createServer(app);
const io = require("socket.io")(http, { path: "/teztz" });
http.listen(3001);

import { DBObj } from "./DBoGenerated";
import { DB } from '../dist/Prostgles';

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
	transactions: true,
	// DEBUG_MODE: true,
	
  publishRawSQL: async (socket, dbo: DBObj, db: DB, user: any) => {
    return Boolean(user && user.type === "admin")
  },
  publish: (socket, dbo: DBObj) => {
		// return "*";
		return  {
			items: {
				select: {
					fields: { id: 1, name: 1 }
				},
				update: "*"
			},
			items2: "*",
			items3: "*"
		};
		
		return {
			items: {
				select: {
					fields: "*",
					forcedFilter: {
						$exists: { items3: { name: "a" } }
					}
				}
			}
		};
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
	onReady: async (dbo: DBObj, db) => {
		
    app.get('*', function(req, res){
      console.log(req.originalUrl)
			res.sendFile(path.join(__dirname+'/index.html'));
		});

		try {

			await dbo.items.delete({ });
			await dbo.items2.delete({ });
			await dbo.items3.delete({ });
			// console.log(await dbo.items3.update({},{ name: "2" }, { returning: "*" }));

			/*EXPERIMENT*/
			// let ins = [], ins2 = [], ins3 = [], names = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
			// for(let i = 0; i < 1000; i++){
			// 	ins.push({ name: randElem(names) })
			// 	ins2.push({ name: randElem(names) })
			// 	ins3.push({ name: randElem(names) })
			// }
			// await dbo.items.insert(ins);
			// await dbo.items2.insert(ins2);
			// await dbo.items3.insert(ins3);
			// return;

			/* Exists filter example */
			await dbo.items.insert([{ name: "a" }, { name: "a" }, { name: "b" }]);
			await dbo.items2.insert([{ name: "a", items_id: 1 }]);
			await dbo.items3.insert([{ name: "a" }]);

			const fo = await dbo.items.findOne(),
				f = await dbo.items.find();
			if(!fo || !fo.name || !f.length || !f[0].name) throw "findOne query failed"

			// return;
			const expect0 = await dbo.items.count({ 
				$and: [
					{ $exists: { items2: { name: "a" } } },
					{ $exists: { items3: { name: "b" } } },
				]
			});
			if(expect0 !== 0) throw "$exists query failed";
			
			/* joinsTo filter example */
			const expect2 = await dbo.items.find({ 
				$and: [
					{ $existsJoined: { "**.items3": { name: "a" } } },
					{ $existsJoined: { items2: { name: "a" } } }
				]
			});
			if(expect2.length !== 2) throw "$exists query failed"
			

			/* exists with exact path filter example */
			const _expect2 = await dbo.items.find({ 
				$and: [
					// { "items2": { name: "a" } },
					// { "items2.items3": { name: "a" } },
					{ $existsJoined: { items2: { name: "a" } } }
				]
			});
      if(_expect2.length !== 2) throw "$wxists query failed"


      /* Transaction example */
      await dbo.tx(async t => {
        await t.items.insert({ name: "tx" });
        const expect1 = await t.items.count({ name: "tx" });
        const expect0 = await dbo.items.count({ name: "tx" });
        if(expect0 !== 0 || expect1 !== 1) throw "dbo.tx failed";
    
        //throw "err"; // Any errors will revert all data-changing commands using the transaction object ( t )
      });
      const expect1 = await dbo.items.count({ name: "tx" });
      if(expect1 !== 1) throw "dbo.tx failed";

			/* Aggregate functions example */
      const aggs = await dbo.items.findOne(
        {}, 
        { 
          select: { 
            id: "$count", 
            max_id: { $max: "id" },
            total: { $count: ["id"] },
            distinct_names: { $countDistinct: ["name"] },
					},
					orderBy: {
						max_id: -1
					}
        }
      );
			const { id, total, distinct_names, max_id } = aggs;
			// console.log([id, total, distinct_names] )
			if(id != 4 || total != 4 || distinct_names != 3 || max_id != 4) throw "Aggregation query failed";

			/* Joins example */
			const items = await dbo.items.find({}, {
				select: {
					"*": 1,
					items3: "*",
					items22: dbo.leftJoin.items2({}, "*")
				}
			});
			if(!items.length || !items.every(it => Array.isArray(it.items3) && Array.isArray(it.items22))){
				console.log(items[0].items3)
				throw "Joined select query failed";
			}

			const rowhash = await dbo.items.findOne({}, { select: { $rowhash: 1 }});
			if(typeof rowhash.$rowhash !== "string") throw "$rowhash query failed";



      console.log("All tests successful");
			if(!process.env.NOSTOP){ 
				console.log("Exiting")
				process.exit(0);
			}

		} catch(err) {
			console.error(err);
			process.exit(1);
    }
    
	},
});


function randElem(items){
	return items[Math.floor(Math.random() * items.length)];
}