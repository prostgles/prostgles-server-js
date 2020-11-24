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
      console.log(req.originalUrl)
			res.sendFile(path.join(__dirname+'/index.html'));
		});

		try {
			await dbo.items.delete({ });
			await dbo.items2.delete({ });
			// await dbo.items3.delete({ });
	

			/* Exists filter example */
			await dbo.items.insert([{ name: "a" }, { name: "a" }, { name: "b" }]);
			await dbo.items2.insert([{ name: "a" }]);
			await dbo.items3.insert([{ name: "a" }]);
			const expect2 = await dbo.items.count({ 
				$and: [
					{ $exists: { items3: { name: "a" } } },
					{ $exists: { items2: { name: "a" } } }
				]
      });
      if(expect2 !== 2) throw "$exists query failed"


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







      console.log("All tests successful");

		} catch(err) {
			console.error(err)
    }
    
	},
});
