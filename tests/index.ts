import path from 'path';
import express from 'express';
// import prostgles from "prostgles-server";
import prostgles from "../dist/index";
const app = express();
const http = require('http').createServer(app);
const io = require("socket.io")(http, { path: "/teztz" });
http.listen(3001);

import { DBObj } from "./DBoGenerated";

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
	transactions: true,
  publish: (socket, dbo: DBObj) => {
		
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
      // console.log(req.originalUrl)
			res.sendFile(path.join(__dirname+'/index.html'));
		});

		try {
			await dbo.items.delete({ });
			await dbo.items2.delete({ });
			await dbo.items3.delete({ });
			// console.log(await dbo.items3.update({},{ name: "2" }, { returning: "*" }));
	

			/* Exists filter example */
			await dbo.items.insert([{ name: "a" }, { name: "a" }, { name: "b" }]);
			await dbo.items2.insert([{ name: "a" }]);
			await dbo.items3.insert([{ name: "a" }]);
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
					{ $joinsTo: { items3: { name: "a" } } },
					{ $joinsTo: { items2: { name: "a" } } }
				]
			});
			if(expect2.length !== 2) throw "$joinsTo query failed"
			

			/* joinsTo with exact path filter example */
			const _expect2 = await dbo.items.find({ 
				$and: [
					{ "items2": { name: "a" } },
					{ "items2.items3": { name: "a" } },
					{ $joinsTo: { items2: { name: "a" } } }
				]
			});
      if(_expect2.length !== 2) throw "$joinsTo query failed"


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
            total: { $count: ["id"] },
            distinct_names: { $countDistinct: ["name"] },
          }
        }
      );
			const { id, total, distinct_names } = aggs;
			// console.log([id, total, distinct_names] )
			if(id != 4 || total != 4 || distinct_names != 3) throw "Aggregation query failed";

			/* Joins example */
			const items = await dbo.items.find({}, {
				select: {
					"*": 1,
					items3: "*"
				}
			});
			if(!items.length || !items.every(it => Array.isArray(it.items3))){
				throw "Joined select query failed";
			}





      console.log("All tests successful");

		} catch(err) {
			console.error(err)
    }
    
	},
});
