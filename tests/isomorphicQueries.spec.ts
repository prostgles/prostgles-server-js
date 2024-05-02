import { strict as assert } from 'assert';
import * as fs from "fs";
import { DBOFullyTyped } from "../dist/DBSchemaBuilder";
import type { DBHandlerClient } from "./client";
import { 
  test, 
  //@ts-ignore
  describe 
} from "node:test";
import { pickKeys } from "prostgles-types";


export const isomorphicQueries = async (db: DBOFullyTyped | DBHandlerClient, log: (msg: string, extra?: any) => void) => {
  log("Starting isomorphic queries");
  const isServer = !!(db.items as any).dboBuilder;
  await describe("Isomorphic queries", async () => {
    await test("Deleting stale data", async () => {
      const itemsCount = await db.items.count?.()
      if(itemsCount){
        log("DELETING items");
        
        /* Access controlled */
        await db.items4.delete!({ });
    
        await db.items4_pub.delete!({ });
        await db.items3.delete!({ });
        await db.items2.delete!({ });
        await db.items.delete!({ });
      }
      await db.sql!(`TRUNCATE items RESTART IDENTITY CASCADE;`);
    });

    await test("Insert error structure", async () => {
      const err = await db.items.insert!({ h: "a" }).catch(err => err);
      const clientOnlyError = {
        detail: 'Array value must start with "{" or dimension information.',
        message: 'malformed array literal: "a"',
        code: '22P02',
        name: 'error',
        severity: 'ERROR',
      }
      if(isServer){
        assert.deepStrictEqual(pickKeys(err, Object.keys(clientOnlyError)), clientOnlyError);
        assert.equal(typeof err.query, "string");
      } else {
        assert.deepStrictEqual(err, clientOnlyError);
      }
    });

    await test("Prepare data", async () => {
      if(!db.sql) throw "db.sql missing";
      const res = await db.items.insert!([{ name: "a" }, { name: "a" }, { name: "b" }], { returning: "*" }); 
      assert.equal(res.length, 3);
      const added1 = '04 Dec 1995 00:12:00';
      const added2 = '04 Dec 1996 00:12:00';
      const added3 = '04 Dec 1997 00:12:00';
  
      await db.items2.insert!([{ name: "a", items_id: res[0]!.id }]);
      await db.items3.insert!([{ name: "a" }, { name: "za123" }]);
      await db.items4.insert!([
        { name: "abc1", public: "public data",    added: added1 },
        { name: "abc2", public: "public data",    added: added1 },
        { name: "abcd", public: "public data d",  added: added2 }
      ]);
      await db[`prostgles_test.basic1`].insert!({
        id_basic: { txt: "basic" },
        txt: "basic1"
      });
      await db.sql(`REFRESH MATERIALIZED VIEW  prostgles_test.mv_basic1;`);
      assert.deepStrictEqual(await db["prostgles_test.mv_basic1"].find!(), await db["prostgles_test.basic1"].find!())
      
      /* Ensure */
      await db[`"*"`].insert!([{ "*": "a" }, { "*": "a" }, { "*": "b" }]);
      await db[`"""*"""`].insert!([{ [`"*"`]: "a" }, { [`"*"`]: "a" }, { [`"*"`]: "b" }]);
  
      await db.various.insert!([
        { name: "abc9",  added: added1, jsn: { "a": { "b": 2 } }  },
        { name: "abc1",  added: added2, jsn: { "a": { "b": 3 } }  },
        { name: "abc81 here", added: added3, jsn: { "a": { "b": 2 } }  }
      ]);
       
      await db.sql("TRUNCATE files CASCADE");
    });

    
    const json = { a: true, arr: "2", arr1: 3, arr2: [1], arrStr: ["1123.string"] }
    await test("merge json", async () => { 
      const inserted = await db.tjson.insert!({ colOneOf: "a", json }, { returning: "*" });
      const res = await db.tjson.update!({ colOneOf: "a" },{ json: { $merge: [{ a: false }] } }, { returning: "*" });
      assert.deepStrictEqual(res?.[0].json, { ...json, a: false });
    });

    await test("json array converted to pg array filter bug", async () => { 
      const result = await db.tjson.find!({ json: [2] });
      assert.deepStrictEqual(result, []);
    });

    await test("onConflict do update", async () => {
      const initial = await db.items4.insert!({ id: -99, name: "onConflict", public: "onConflict" }, { returning: "*" });
      const updated = await db.items4.insert!({ id: -99, name: "onConflict", public: "onConflict2" }, { onConflict: "DoUpdate", returning: "*" });
      assert.equal(initial.id, -99);
      assert.equal(initial.public, "onConflict");
      assert.equal(updated.id, -99);
      assert.equal(updated.public, "onConflict2");
      await db.items4.delete!({ id: -99 });
    });

    const fileFolder = `${__dirname}/../../server/dist/server/media/`;
    const fileName = "sample_file.txt";
    await test("Local file upload", async () => {
      let str = "This is a string",
        data = Buffer.from(str, "utf-8"),
        mediaFile = { data, name: fileName }

      const file = await db.files.insert!(mediaFile, { returning: "*" });
      const _data = fs.readFileSync(fileFolder + file.name);
      assert.equal(str, _data.toString('utf8'));

      await tryRun("Nested insert", async () => {
    
        const nestedInsert = await db.users_public_info.insert!({ name: "somename.txt", avatar: mediaFile }, { returning: "*" });
        const { name, avatar } = nestedInsert;
        const  { extension, content_type, original_name } = avatar;
        assert.deepStrictEqual(
          { extension, content_type, original_name },
          {
            extension: 'txt',
            content_type: 'text/plain',
            original_name: 'sample_file.txt',
          }
        );
        
        assert.equal(name, "somename.txt");
      });
  
    });

    await test("Local file delete", async () => {
      const file = { 
        data: Buffer.from("str", "utf-8"), 
        name: "will delete.txt" 
      }
      await db.files.insert!(file);
      
      const files = await db.files.find!({ original_name: file.name });
      assert.equal(files.length, 1);
      const exists0 = fs.existsSync(fileFolder+files[0].name);
      assert.equal(exists0, true);
      await db.files.delete!({ original_name: file.name }, { returning: "*" });
      const exists = fs.existsSync(fileFolder+files[0].name);
      assert.equal(exists, false);
    })

    await test("Local file update", async () => {
      const initialStr = "str";
      const newStr = "str new";
      const file = { 
        data: Buffer.from(initialStr, "utf-8"), 
        name: "will update.txt" 
      }
      const newFile = { 
        data: Buffer.from(newStr, "utf-8"), 
        name: "will update new.txt" 
      }
      await db.files.insert!(file);
      const originals = await db.files.find!({ original_name: file.name });
      assert.equal(originals.length, 1);
      const [original] = originals;
      const initialFileStr = fs.readFileSync(fileFolder + original.name).toString('utf8');
      assert.equal(initialStr, initialFileStr);

      await db.files.update!({ id: original.id }, newFile);
      
      const newFileStr = fs.readFileSync(fileFolder + original.name).toString('utf8');
      assert.equal(newStr, newFileStr);
      
      const newF = await db.files.findOne!({ id: original.id });

      assert.equal(newF?.original_name, newFile.name)
    });
    
    await test("getColumns definition", async () => {
      const res = await db.tr2.getColumns!("fr");
      const expected =  [
          {
            "label": "Id",
            "name": "id",
            "data_type": "integer",
            "udt_name": "int4",
            "element_type": null,
            is_updatable: true,
            "element_udt_name": null,
            "is_pkey": true,
            "column_default": null,
            "comment": null,
            "ordinal_position": 1,
            "is_nullable": false,
            "references": null,
            "has_default": true,
            "tsDataType": "number",
            "insert": true,
            "select": true,
            "orderBy": true,
            "filter": true,
            "update": true,
            "delete": true
          },
          {
            "label": "Tr1 id",
            "name": "tr1_id",
            "data_type": "integer",
            "udt_name": "int4",
            "element_type": null,
            is_updatable: true,
            "element_udt_name": null,
            "is_pkey": false,
            "column_default": null,
            "comment": null,
            "ordinal_position": 2,
            "is_nullable": true,
            "references": [{
              "ftable": "tr1",
              "fcols": [
                "id"
              ],
              "cols": [
                "tr1_id"
              ]
            }],
            "has_default": false,
            "tsDataType": "number",
            "insert": true,
            "select": true,
            "orderBy": true,
            "filter": true,
            "update": true,
            "delete": true
          },
          {
            "label": "fr_t1",
            hint: "hint...",
            min: "a", 
            max: "b",
            "name": "t1",
            "data_type": "text",
            "udt_name": "text",
            "element_type": null,
            is_updatable: true,
            "element_udt_name": null,
            "is_pkey": false,
            "column_default": null,
            "comment": null,
            "ordinal_position": 3,
            "is_nullable": true,
            "references": null,
            "has_default": false,
            "tsDataType": "string",
            "insert": true,
            "select": true,
            "orderBy": true,
            "filter": true,
            "update": true,
            "delete": true
          },
          {
            "label": "en_t2",
            "name": "t2",
            "data_type": "text",
            "udt_name": "text",
            "element_type": null,
            is_updatable: true,
            "element_udt_name": null,
            "is_pkey": false,
            "column_default": null,
            "comment": null,
            "ordinal_position": 4,
            "is_nullable": true,
            "references": null,
            "has_default": false,
            "tsDataType": "string",
            "insert": true,
            "select": true,
            "orderBy": true,
            "filter": true,
            "update": true,
            "delete": true
          }
        ];

      assert.deepStrictEqual(
        res, 
        expected
      );
      const resDynamic = await db.tr2.getColumns!("fr", { rule: "update", filter: {}, data: { t2: "a" } });
      assert.deepStrictEqual(
        resDynamic, 
        expected
      );
    });

    await test("returnType", async () => {

      const whereStatement = await db.tr1.find!({ t1: "a"  }, { returnType: "statement-where" });

      assert.equal(whereStatement, `"t1" = 'a'`);
    });

    await test("Table config triggers", async () => {
      const tr1 = await db.tr1.insert!({  })
      const tr2 = await db.tr2.insert!({ 
        tr1_id: 1,
        t1: "a",
        t2: "b"
      });
      try {
        await db.tr2.delete!();
      } catch(e){

      }
      const one = await db.tr2.findOne!({ 
        t1: "a",
        t2: "b"
      });
      if(!one) {
        throw "Row missing";
      }
    });

    await test("$unnest_words", async () => {
      const res = await db.various.find!({}, { returnType: "values", select: { name: "$unnest_words" } });

      assert.deepStrictEqual( res,  [
        'abc9',
        'abc1',
        'abc81',
        'here'
      ]);
    })

    /**
     * Group by/Distinct
     */
    await test("Group by/Distinct", async () => {
      const res = await db.items.find!({}, { select: { name: 1 }, groupBy: true });
      const resV = await db.items.find!({}, { select: { name: 1 }, groupBy: true, returnType: "values" });
      
      assert.deepStrictEqual(
        res,
        [
          { name: 'a' },
          { name: 'b' },
        ]
      );
      assert.deepStrictEqual(
        resV,
        ["a", "b"]
      );
    })

    /**
     * returnType "value"
     */
    await test("returnType: value", async () => {
      const resVl = await db.items.find!({}, { select: { name: { $array_agg: ["name"] } }, returnType: "value" });
      
      assert.deepStrictEqual(
        resVl,
        ["a", "a", "b"]
      );
    });

    /**
     * TODO -> ADD ALL FILTER TYPES
     */   
    await test("FTS filtering", async () => {
      const res = await db.various.count!({ "tsv.@@.to_tsquery": ["a"] });
      assert.equal(res, 0);


      const d = await db.various.findOne!(
        { "name.@@.to_tsquery": ["abc81"] }, 
        { select: { 
          h: { "$ts_headline_simple": ["name", { plainto_tsquery: "abc81" }] },
          hh: { "$ts_headline": ["name", "abc81"] } ,
          added: "$year",
          addedY: { "$date": ["added"] }
        }});
      // console.log(d);
      await db.various.findOne!(
        { }, 
        { select: { 
          h: { "$ts_headline_simple": ["name", { plainto_tsquery: "abc81" }] },
          hh: { "$ts_headline": ["name", "abc81"] } ,
          added: "$year",
          addedY: { "$date": ["added"] }
        }});
        
      /*
      * Dates become strings after reaching client.
      * Serialize col dataTypes and then recast ??
      */
      assert.deepStrictEqual(JSON.parse(JSON.stringify(d)), {
        h: '<b>abc81</b> here',
        hh: '<b>abc81</b> here',
        added: '1997',
        addedY: '1997-12-04',
      });
    });

    await test("$term_highlight", async () => {
      const term = "abc81";
      const res = await db.various.find!(
        { "hIdx.>": -2 }, 
        { select: { 
            h: { $term_highlight: [["name"], term, { }] },
            hFull: { $term_highlight: ["*", "81", { }] },
            hOrdered: { $term_highlight: [["name", "id"], "81", { }] },
            hIdx:  { $term_highlight: [["name"], term, { returnType: "index" }] },
            hBool:  { $term_highlight: [["name"], term, { returnType: "boolean" }] },
            hObj:  { $term_highlight: [["name"], term, { returnType: "object" }] },
            hObjAll:  { $term_highlight: ["*", term, { returnType: "object" }] },
          },
          orderBy: { hIdx: -1 } 
        }
      ); 
      
      assert.deepStrictEqual(
        res[0], 
        {
          h:["name: ",["abc81"]," here"],

          /* Search all allowed fields using "*"  */
          hFull: [
            'id: 3, h: , name: abc',
            [ '81' ],
            ' here, tsv: , jsn: {"a":{"b":2}}, added: 1997-12-04 00:12:00'
          ],

          /* Search specific fields in specific order */
          hOrdered:["name: abc",["81"]," here, id: 3"],
          hIdx: 6, 
          hBool: true,
          hObj: {
            name: [
              '', ['abc81'],' here'
            ]
          },
          hObjAll: {
            name: [
              '', ['abc81'],' here'
            ]
          },
        }
      )
    });

    await test("funcFilters: $term_highlight", async () => {
      const term = "abc81";
      const res = await db.various.count!(
        { $term_highlight: [["*"], term, { returnType: "boolean" }] }
      );
      assert.equal(+res, 1)
    });

    await test("subscribe", async () => {
      await tryRunP("subscribe", async (resolve, reject) => {
        await db.various.insert!({ id: 99 });
        const sub = await db.various.subscribe!({ id: 99  }, {  }, async items => {
          const item = items[0];
          
          if(item && item.name === "zz3zz3"){
            await db.various.delete!({ name: "zz3zz3" });
            sub.unsubscribe();
            resolve(true)
          }
        });
        await db.various.update!({ id: 99 }, { name: "zz3zz1" });
        await db.various.update!({ id: 99 }, { name: "zz3zz2" });
        await db.various.update!({ id: 99 }, { name: "zz3zz3" });
      }, { timeout: 4000 });
    });
    

    await test("subscribeOne with throttle", async () => {
      await tryRunP("subscribeOne with throttle", async (resolve, reject) => {
        await db.various.insert!({ id: 99 });
        const start = Date.now(); // name: "zz3zz" 
        const sub = await db.various.subscribeOne!({ id: 99  }, { throttle: 1700 }, async item => {
          // const item = items[0]
          // console.log(item)

          const now = Date.now();
          if(item && item.name === "zz3zz2" &&  now - start > 1600 &&  now - start < 1800){
            await db.various.delete!({ name: "zz3zz2" });
            sub.unsubscribe()
            resolve(true)
          }
        });
        await db.various.update!({ id: 99 }, { name: "zz3zz1" });
        await db.various.update!({ id: 99 }, { name: "zz3zz2" });
      }, { timeout: 4000 });
    });

    await test("JSON filtering", async () => {
      const res = await db.various.count!({ "jsn->a->>b": '3' });
      assert.equal(res, 1)
    });

    await test("Complex filtering", async () => {
      const res = await db.various.count!({ 
        $and: [
          { 
            $filter: [
              { $year: ["added"] },
              "=",
              '1996'
            ] 
          },
          { 
            $filter: [
              { $Mon: ["added"] },
              "=",
              'Dec'
            ] 
          }

        ]
      });
      assert.equal(res, 1)
    });

    await test("template_string function", async () => {
      const res = await db.various.findOne!({ name: 'abc9' }, { select: { tstr: { $template_string: ["{name} is hehe"] } } });
      const res2 = await db.various.findOne!({ name: 'abc9' }, { select: { tstr: { $template_string: ["is hehe"] } } });
      assert.equal(res?.tstr, "abc9 is hehe")
      assert.equal(res2?.tstr, "is hehe")
    });

    await test("Between filtering", async () => {
      const res = await db.various.count!({ 
        added: { $between: [
          '06 Dec 1995 00:12:00',
          '03 Dec 1997 00:12:00'
        ] } });
      assert.equal(res, 1)
    });
    await test("In filtering", async () => {
      const res = await db.various.count!({ added: { $in: ['04 Dec 1996 00:12:00'] } });
      assert.equal(res, 1)
    });

    await test("Order by", async () => {
      const res = await db.items.find!({}, { select: { name: 1 }, orderBy: [{ key: "name", asc: false, nulls: "first", nullEmpty: true }] });
      assert.deepStrictEqual(res, [{ name: 'b'}, { name: 'a'}, { name: 'a'}]);
    });
    await test("Order by aliased func", async () => {
      const res = await db.items.find!({ }, { select: { uname: { $upper: ["name"] }, count: { $countAll: [] } }, orderBy: { uname: -1 }});
      assert.deepStrictEqual(res, [{ uname: 'B', count: '1'}, { uname: 'A', count: '2'} ])
    });
    await test("Filter by aliased func", async () => {
      const res = await db.items.find!({ uname: 'B' }, { select: { uname: { $upper: ["name"] }, count: { $countAll: [] } } });
      assert.deepStrictEqual(res, [{ uname: 'B', count: '1'}])
    });
    await test("Count with Filter by aliased func ", async () => {
      const res = await db.items.count!({ uname: 'A' }, { select: { uname: { $upper: ["name"] } } });
      assert.deepStrictEqual(res, 2)
    });
    await test("Count with Aggregate and Filter by aliased func ", async () => {
      const res = await db.items.count!({ uname: 'A' }, { select: { uname: { $upper: ["name"] }, count: { $countAll: [] } } });
      assert.deepStrictEqual(res, 1)
    });
    await test("Order by aggregation", async () => {
      const res = await db.items.find!({ }, { select: { name: 1, count: { $countAll: [] } }, orderBy: { count: -1 }});
      assert.deepStrictEqual(res, [  { name: 'a', count: '2'} , { name: 'b', count: '1'} ])
    });
    await test("Order by colliding alias name", async () => {
      const res = await db.items.find!({ }, { select: { name: { $countAll: [] }, n: { $left: ["name", 1]} }, orderBy: { name: -1 }});
      assert.deepStrictEqual(res, [  { name: '2', n: 'a' } , { name: '1', n: 'b'} ])
    });

    await test("Update batch example", async () => {
      
      await db.items4.updateBatch!([
        [{ name: "abc1" }, { name: "abc" }],
        [{ name: "abc2" }, { name: "abc" }]
      ]);
      assert.equal(await db.items4.count!({ name: "abc" }), 2);
    })

    await test("Function example", async () => {
    
      const f = await db.items4.findOne!({}, { select: { public: 1, p_5: { $left: ["public", 3] } } });
      assert.equal(f?.p_5.length, 3);
      assert.equal(f?.p_5, f.public.substr(0, 3));

      // Nested function
      const fg = await db.items2.findOne!({}, { select: { id: 1, name: 1, items3: { name: "$upper" } } });// { $upper: ["public"] } } });
      assert.deepStrictEqual(fg, { id: 1, name: 'a', items3: [ { name: 'A' } ] });

      // Date utils
      const Mon = await db.items4.findOne!({ name: "abc" }, { select: { added: "$Mon" } });
      assert.deepStrictEqual(Mon, { added: "Dec" });

      // Date + agg
      const MonAgg = await db.items4.find!({ name: "abc" }, { select: { added: "$Mon", public: "$count" } });
      assert.deepStrictEqual(MonAgg, [{ added: "Dec", public: '2' }]);

      // Returning
      const returningParam = { returning: { id: 1, name: 1, public: 1 , $rowhash: 1, added_day: { "$day": ["added"] } }} as const ;  //   ctid: 1,
      let i = await db.items4_pub.insert!( { name: "abc123", public: "public data", added: '04 Dec 1995 00:12:00' }, returningParam);
      assert.deepStrictEqual(i, { id: 1,  name: 'abc123', public: 'public data', $rowhash: '347c26babad535aa697a794af89195fe', added_day: 'monday'  }); //  , ctid: '(0,1)'
    
      let u = await db.items4_pub.update! ({ name: "abc123" }, { public: "public data2" }, returningParam);
      assert.deepStrictEqual(u, [{ id: 1,  name: 'abc123', public: 'public data2', $rowhash: '9d18ddfbff9e13411d13f82d414644de', added_day: 'monday'  }]);
    
      let d = await db.items4_pub.delete!( { name: "abc123" }, returningParam);
      assert.deepStrictEqual(d, [{ id: 1,  name: 'abc123', public: 'public data2', $rowhash: '9d18ddfbff9e13411d13f82d414644de', added_day: 'monday'  }]);
    
      console.log("TODO: socket.io stringifies dates")
    });

    await test("JSONB filtering", async () => {
      const obj = { propName: 3232 };
      const row = await db.obj_table.insert!({ obj }, { returning: "*" });
      const sameRow = await db.obj_table.findOne!({obj });
      const sameRow1 = await db.obj_table.findOne!({ obj: { "=": obj } });
      const sameRow2 = await db.obj_table.findOne!({ "obj.=": obj });
      const count = await db.obj_table.count!({ obj });
      assert.deepStrictEqual(row, sameRow);
      assert.deepStrictEqual(row, sameRow1);
      assert.deepStrictEqual(row, sameRow2);
      assert.deepStrictEqual(+count, 1);
    })

    await test("Postgis examples", async () => {
      await db.shapes.delete!();
      const p1 = { $ST_GeomFromText: ["POINT(-1 1)", 4326] },
        p2 = { $ST_GeomFromText: ["POINT(-2 2)", 4326] };
      await db.shapes.insert!([
        { geom: p1, geog: p1 },
        { geom: p2, geog: p2  },
      ])
    
      /** Basic functions and extent filters */
      const f = await db.shapes.findOne!({ $and: [
        {"geom.&&.st_makeenvelope": [
          -3, 2,
          -2, 2
        ]},
        {"geog.&&.st_makeenvelope": [
          -3, 2,
          -2, 2
        ] }]
      }, { 
        select: {
          geomTxt: {"$ST_AsText": ["geom"]},
          geomGeo: {"$ST_AsGeoJSON": ["geom"]},
        },
        orderBy: "geom"
      });
      assert.deepStrictEqual(f, {
        geomGeo: {
          coordinates: [-2,2],
          type: 'Point'
        },
        geomTxt: 'POINT(-2 2)'
      });

      /**Aggregate functions */
      const aggs = await db.shapes.findOne!({ }, { 
        select: {
          xMin: { "$ST_XMin_Agg": ["geom"] },
          xMax: { "$ST_XMax_Agg": ["geom"] },
          yMin: { "$ST_YMin_Agg": ["geom"] },
          yMax: { "$ST_YMax_Agg": ["geom"] },
          zMin: { "$ST_ZMin_Agg": ["geom"] },
          zMax: { "$ST_ZMax_Agg": ["geom"] },
          extent: { "$ST_Extent": ["geom"] },
          //  extent3D: { "$ST_3DExtent": ["geom"] },
        },
      });
      assert.deepStrictEqual(aggs, {
        xMax: -1,
        xMin: -2,
        yMax: 2,
        yMin: 1,
        zMax: 0,
        zMin: 0,
        extent: 'BOX(-2 1,-1 2)',
        //  extent3D: 'BOX3D(-2 1 0,-1 2 6.952908662134e-310)' <-- looks like a value that will fail tests at some point
      });

    });


    await test("jsonbSchema validation", async () => {
      
      /**
       * 
    tjson: {
      json: { jsonbSchema: { 
        a: { type: "boolean" },
        arr: { enum: ["1", "2", "3"] },
        arr1: { enum: [1, 2, 3] },
        arr2: { type: "integer[]" },
        o: { oneOf: [{ o1: { type: "integer" } }, { o2: { type: "boolean" } }], optional: true },
        }  
      }
    },
      */
    
      const fo = await db.tjson.insert!({ colOneOf: "a", json }, { returning: "*"});
      // assert.deepStrictEqual(fo.json, json);
      await db.tjson.insert!({ colOneOf: "a", json: {...json, o: { o1: 2 } } })
      try {
        await db.tjson.insert!({ colOneOf: "a", json: { a: true, arr: "22"} });
        throw "Should have failed"
      } catch(e){
        // Expected
      }
    });

    
    await test("find and findOne", async () => {
    
      const fo = await db.items.findOne!();
      const f = await db.items.find!();
      assert.deepStrictEqual(fo,    { h: null, id: 1, name: 'a' });
      assert.deepStrictEqual(f[0],  { h: null, id: 1, name: 'a' });
    });

    await test("Result size", async () => {
      const is75bits = await db.items.size!({ 
      }, { select: { name: 1 } });
      assert.equal(is75bits, '75', "Result size query failed")
    });

    await test("Basic exists", async () => {
      const expect0 = await db.items.count!({ 
        $and: [
          { $exists: { items2: { name: "a" } } },
          { $exists: { items3: { name: "b" } } },
        ]
      });
      assert.equal(expect0, 0, "$exists query failed")
    });
    
    await test("Basic fts with shorthand notation", async () => {
      const res = await db.items.count!({ 
        $and: [
          { $exists: { items2: { "name.@@.to_tsquery": ["a"] } } },
          { $exists: { items3: { "name.@@.to_tsquery": ["b"] } } },
        ]
      });
      // assert.deepStrictEqual(res, { name: 'a'})
      assert.equal(res, 0, "FTS query failed")
    });

    await test("Exists with shortest path wildcard filter example", async () => {
      const expect2 = await db.items.find!({ 
        $and: [
          { $existsJoined: { "**.items3": { name: "a" } } },
          { $existsJoined: { items2: { name: "a" } } }
        ]
      });
      assert.equal(expect2.length, 2, "$existsJoined query failed");
      const expectNothing = await db.items.find!({ 
        $and: [
          { $existsJoined: { "**.items3": { name: "nothing" } } },
          { $existsJoined: { items2: { name: "a" } } }
        ]
      });
      assert.equal(expectNothing.length, 0, "$existsJoined query failed");
    });
      

    await test("Exists with exact path filter example", async () => {
      const _expect2 = await db.items.find!({ 
        $and: [
          // { "items2": { name: "a" } },
          // { "items2.items3": { name: "a" } },
          { $existsJoined: { items2: { name: "a" } } }
        ] 
      });
      assert.equal(_expect2.length, 2, "$existsJoined query failed");
    });

    await test("Not Exists with exact path filter example", async () => {
      const _expect1 = await db.items.find!({ 
        $and: [
          { $notExistsJoined: { items2: { name: "a" } } }
        ] 
      });
      assert.equal(_expect1.length, 1, "$notExistsJoined query failed");
    });

    /* Upsert */
    await test("Upsert example", async () => {
      await db.items.upsert!({ name: "tx" }, { name: "tx" });
      await db.items.upsert!({ name: "tx" }, { name: "tx" });
      assert.equal(await db.items.count!({ name: "tx" }), 1, "upsert command failed");
    });

    /* Joins example */
    await test("Joins example", async () => {
      const items = await db.items.find!({}, {
        select: {
          "*": 1,
          items3: "*",
          items22: db.leftJoin?.items2({}, "*")
        }
      });
      
      if(!items.length || !items.every(it => Array.isArray(it.items3) && Array.isArray(it.items22))){
        console.log(items[0].items3)
        throw "Joined select query failed";
      }
    });

    /* Joins duplicate table example */
    await test("Joins repeating table example", async () => {
      const items2 = await db.items.find!({}, {
        select: {
          "*": 1,
          items2: "*"
        }
      });
      const items2j = await db.items.find!({}, {
        select: {
          "*": 1,
          items2: "*",
          items2j: db.leftJoin?.items2({}, "*")
        }
      });
      
      items2.forEach((d, i)=> {
        assert.deepStrictEqual(d.items2, items2j[i].items2, "Joins duplicate aliased table query failed");
        assert.deepStrictEqual(d.items2, items2j[i].items2j, "Joins duplicate aliased table query failed");
      });
    });
    
    await test("Join aggregate functions example", async () => {
      const singleShortHandAgg = await db.items.findOne!(
        {},
        { select: { id: "$max" }}
      );
      const singleAgg = await db.items.findOne!(
        {},
        { select: { id: { "$max": ["id"] } }}
      );
      assert.deepStrictEqual(singleShortHandAgg, { id: 4 });
      assert.deepStrictEqual(singleAgg, { id: 4 });

      const shortHandAggJoined = await db.items.findOne!(
        { id: 4 },
        { select: { id: 1, items2: { name: "$max" } }}
      );
      assert.deepStrictEqual(shortHandAggJoined, { id: 4, items2: [] });
    });

    /* $rowhash -> Custom column that returms md5(ctid + allowed select columns). Used in joins & CRUD to bypass PKey details */
    await test("$rowhash example", async () => {
      const rowhash = await db.items.findOne!({}, { select: { $rowhash: 1, "*": 1 }});
      const f = { $rowhash: rowhash?.$rowhash };
      const rowhashView = await db.v_items.findOne!({}, { select: { $rowhash: 1 }});
      const rh1 = await db.items.findOne!({ $rowhash: rowhash?.$rowhash }, { select: { $rowhash: 1 }});
      const rhView = await db.v_items.findOne!({ $rowhash: rowhashView?.$rowhash }, { select: { $rowhash: 1 }});
      // console.log({ rowhash, f });

      await db.items.update!(f, { name: 'a' });
      
      // console.log(rowhash, rh1)
      // console.log(rowhashView, rhView)
      if(
        typeof rowhash?.$rowhash !== "string" || 
        typeof rowhashView?.$rowhash !== "string" ||
        rowhash.$rowhash !== rh1?.$rowhash ||
        rowhashView.$rowhash !== rhView?.$rowhash
      ){ 
        throw "$rowhash query failed";
      }
    });

    await test("Reference column nested insert", async () => {
      const nestedRow = { name: "nested_insert" };
      const parentRow = { name: "parent insert" }
      const pr = await db.items2.insert!({ items_id: nestedRow, ...parentRow }, { returning: "*" });
      
      const childRows = await db.items.find!(nestedRow);
      assert.equal(childRows.length, 1);
      assert.deepStrictEqual(await db.items2.findOne!(parentRow), { hh: null, id: pr.id, ...parentRow, items_id: childRows[0].id });

    });

    await test("Join escaped table names with quotes", async () => {
      await db[`"""quoted0"""`].insert!({
        [`"text_col0"`]: "0",
        [`"quoted1_id"`]: {
          [`"text_col1"`]: "1",
          [`"quoted2_id"`]: {
            [`"text_col2"`]: "2",
          }
        }
      });

      const res = await db[`"""quoted0"""`].find!({
        [`"text_col0"`]: "0",
      }, { 
        select: {
          "*": 1,
          [`"""quoted2"""`]: {
            [`"text_col2"`]: 1,
            [`"id2"`]: "$min",
            [`id2 max`]: { "$max": [`"id2"`] },
          }
        }
      });

      assert.deepStrictEqual(res[0], {
        '"""quoted2"""': [
          {
            '"text_col2"': '2',
            'id2 max': 1,
            '"id2"': 1,
          }
        ],
        '"id0"': 1,
        '"quoted1_id"': 1,
        '"text_col0"': '0'
      });


      const aliasedQuotedJoin = await db[`"""quoted0"""`].find!({
        [`"text_col0"`]: "0",
      }, { 
        select: {
          "*": 1,
          '"ali as"': {
            $leftJoin: '"""quoted2"""',
            select: {
              '"text_col2"': { $left: ['"text_col2"', 2] },
              '"id2"': "$min",
              'id2 max': { "$max": [`"id2"`] },
            }
          }
        }
      });

      assert.deepStrictEqual(aliasedQuotedJoin, [{
        '"id0"': 1,
        '"quoted1_id"': 1,
        '"text_col0"': '0',
        '"ali as"': [{
          '"text_col2"': '2',
          '"id2"': 1,
          'id2 max': 1,
        }]
      }]);

      const exists1 = await db[`"""quoted0"""`].find!({
        $existsJoined: {
          path: ['"""quoted1"""', '"""quoted2"""'],
          filter: {
            '"id2"': 1,
          }
        }
      }, { select: "*" });
      /** Duplicated tables */
      const exists2 = await db[`"""quoted0"""`].find!({
        $existsJoined: {
          path: ['"""quoted1"""', '"""quoted2"""','"""quoted1"""', '"""quoted2"""'],
          filter: {
            '"id2"': 1,
          }
        }
      }, { select: "*" });
      assert.deepStrictEqual(exists1, exists2)
    })

    await test("Reverse join with agg", async () => {
      const inserted = await db.tr1.insert!({ tr2: { t1: "a", t2: "b" } }, { returning: "*" });

      const idAggSelect =  {
        ids: {
          $array_agg: ["id"],
        }
      }
      const normalJoin = await db.tr1.find!({}, { orderBy: { id: true }, select: { "*": 1, tr2: { $innerJoin: "tr2", filter: { t1: "a" }, select: idAggSelect } } })
      const reverseJoin = await db.tr2.find!({ t1: "a" }, { orderBy: { id: true }, select: { "*": 1, tr1: { $innerJoin: "tr1", select: idAggSelect } } });
      assert.deepStrictEqual(normalJoin[0], {"id": 1,"t1": null,"tr2": [{ "ids": [1] }]});
      assert.deepStrictEqual(normalJoin[1], {"id": 2,"t1": null,"tr2": [{ "ids": [2] }]});
      assert.deepStrictEqual(reverseJoin[0], { "id": 1, "tr1_id": 1, "t1": "a", "t2": "b", "tr1": [{ "ids": [1] }] });
      assert.deepStrictEqual(reverseJoin[1], { "id": 2, "tr1_id": 2, "t1": "a", "t2": "b", "tr1": [{ "ids": [2] }] });
    });

    await test("Related table subscribe", async () => {
      const sub = await db.tr1.subscribe!({}, {
        select: {
          "*": 1,
          tr2: "*",
          tr3: "*",
        }
      },  _rows => {

      });

      await sub.unsubscribe();
    });

    await test("Nested sort by computed col", async () => {
      const getSorted = (asc = false) => db.tr1.find!({}, {
        select: {
          "*": 1,
          tr2: {
            maxId: { $max: ["id"] }
          }
        },
        orderBy: {
          "tr2.maxId": asc
        }
      })
      const sortedAsc = await getSorted(true);
      const sortedDesc = await getSorted(false);
      assert.deepStrictEqual(
        sortedAsc.map(d => d.tr2[0].maxId).slice(0).reverse(),
        sortedDesc.map(d => d.tr2[0].maxId)
      );
    });

    await test("Nested function on different than source column getNewQuery name bug fix", async () => {
      const res = await db.tr1.find!({}, {
        select: {
          "*": 1,
          tr2: {
            sign: { $sign: ["tr1_id"] }
          }
        },
        orderBy: {
          id: true
        }
      });
      assert.deepStrictEqual(res.map(row => [row.id, row.tr2[0]!.sign]), [[1,1], [2, 1]]);
    })

    await test("Reference column deep nested insert", async () => {
      
      const pr = await db.items4a.insert!({ 
        items_id: { name: "it" }, 
        items2_id: { name: "it2", items_id: { name: "it" } }, 
        name: "it4a" 
      }, { returning: "*" });
      const itemsCount = await db.items.count!({ name: "it" })
      const items2Count = await db.items2.count!({ name: "it2" })
      const items4aCount = await db.items4a.count!({ name: "it4a" })
      
      assert.equal(+itemsCount, 2);
      assert.equal(+items2Count, 1);
      assert.equal(+items4aCount, 1);
      
    });

    await test("Multi reference column nested insert", async () => {
      await db.items_multi.insert!({ 
        items0_id: { name: "multi" }, 
        items1_id: { name: "multi" }, 
        items2_id: { name: "multi" }, 
        items3_id: { name: "multi" }, 
        name: "root_multi" 
      }, { returning: "*" });
      const itemsCount = await db.items.count!({ name: "multi" })
      assert.equal(+itemsCount, 4);

      const multiItem = await db.items_multi.findOne!({ name: "root_multi" }, { select: { "*": 1, items: "*" } });
      assert.equal(multiItem?.name, "root_multi");
      assert.equal(multiItem?.items.filter(d => d.name === "multi").length, 4);

    });

    await test("Join path", async () => {

      await db.items_multi.insert!({ 
        items0_id: { name: "multi0" }, 
        items1_id: { name: "multi1" },
        name: "root_multi" 
      }, { returning: "*" });

      const res = await db.items_multi.find!(
        {},
        {
          select: {
            "*": 1,
            i0: db.innerJoin?.items_multi(
              { name: "multi0" }, 
              "*", 
              { path: [{ table: "items", on: [{ items0_id: "id" }] }] }
            )
          },
          orderBy: {
            "i0.name": -1
          }
        }
      );
      assert.equal(res.length, 1);
      assert.equal(res[0].i0[0].name, "multi0");
      assert.equal(res[0].items2_id, null);
      assert.equal(res[0].items2_id, null);
    });

    await test("Self join", async () => {
      await db.self_join.delete!();
      const a = await db.self_join.insert!({ name: "a" });
      const a1 = await db.self_join.insert!({ name: "a", my_id: { name: "b" } });
      const a2 = await db.self_join.insert!({ name: "a", my_id1: { name: "b1" } });

      const one = await db.self_join.find!({}, { 
        select: { 
          name: 1, 
          my: {
            $innerJoin: [{ table: "self_join", on: [{ my_id: "id" }] }],
            filter: { name: "b" },
            select: "*",
            orderBy: "name"
          }
        } 
      });
      assert.equal(one.length, 1);
      assert.equal(one[0].my.length, 1);
      assert.equal(one[0].my[0].name, "b");
    });


    await test("One to many multi join duplicate row bug fix", async () => {
      await db.symbols.insert!([
        { 
          id: "btc", 
          trades: [
            { price: 1 },
            { price: 3 },
            { price: 2 },
          ] 
        },{ 
          id: "eth", 
          trades: [
            { price: .1 },
            { price: .3 },
            { price: .2 },
          ] 
        },{
          id: "abc"
        }
      ]);

      const res = await db.symbols.find!({}, {
        select: {
          id: 1,
          trades: "*",
          tradesAlso: {
            $leftJoin: "trades",
            select: "*",
          },
        }
      });
      assert.equal(res.length, 3);
      res.forEach(row => {
        assert(typeof row.id, "number");
        assert(typeof (row as any).price, "number");
        assert(typeof (row as any).symbol, "string");
        assert.deepStrictEqual(row.trades, row.tradesAlso);
        if(row.id !== "abc"){
          assert.equal(row.trades.length, 3)
        }
      });

      const resSortedInnerJoin = await db.symbols.find!({}, {
        select: {
          id: 1,
          trades: {
            $innerJoin: "trades",
            select: "*",
            orderBy: { price: -1 },
          },
          tradesAlso: {
            $innerJoin: "trades",
            select: "*",
            orderBy: { price: 1 },
          },
        }
      });
      assert.equal(resSortedInnerJoin.length, 2);
      resSortedInnerJoin.forEach(row => {
        assert.deepStrictEqual(row.trades.slice(0).reverse(), row.tradesAlso);
        assert.notEqual(row.id, "abc");
      });
    });
  });

  await test("Having clause", async () => {
    // await db.items.insert!([{ name: "a" }, { name: "a" }]);
    const res = await db.items.find!(
      {}, 
      { 
        select: { name: 1, c: { $countAll: [] } 
      }, 
      having: { 
        c: 4, 
      } 
    });
    assert.deepStrictEqual(res, [{
      c: '4',
      name: 'multi'
    }]);
  });
  await test("Nested join having clause", async () => {
    const res = await db.items.find!(
      {}, 
      { 
        select: { 
          name: 1, 
          itms2: {
            $innerJoin: "items2",
            select: {
              name: 1,
              c: { $countAll: [] }
            },
            having: { c: 1 } 
          },
        }, 
      }
    );
    assert.deepStrictEqual(res, [
      {
        name: 'a',
        itms2: [{ c: 1, name: 'a' }],
      },
      {
        name: 'a',
        itms2: [{ c: 1, name: 'a' }],
      }
    ]);
  });
 
}


export async function tryRun(desc: string, func: () => any, log?: Function){
  try {
    await func();
  } catch(err) {
    console.error(desc + " FAILED:", err);
    log?.("FAIL: ", err);
    console.trace(err)
    await tout(50);
    throw err;
  }
}
export function tryRunP(desc: string, func: (resolve: any, reject: any) => any, opts?: { log?: Function; timeout?: number; }){
  return new Promise(async (rv, rj) => {
    const testTimeout = Number.isFinite(opts?.timeout)? setTimeout(() => {
      const errMsg = `${desc} failed. Reason: Timout reached: ${opts!.timeout}ms`;
      opts?.log?.(errMsg);
      rj(errMsg);
    }, opts!.timeout) : undefined
    try {
      await func(rv, rj);
      clearTimeout(testTimeout);
    } catch(err: any){
      opts?.log?.(`${desc} failed: ` + JSON.stringify(err));
      rj(err);
      await tout(50);
      throw err;    
    }
  });
}
const tout = (t = 3000) => {
  return new Promise(async (resolve, reject) => {
    setTimeout(() => {
      resolve(true)
    },t)
  });
}