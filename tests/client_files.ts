
import { DBSchemaTable } from "prostgles-types";
import type { Auth, DBHandlerClient } from "./client/index";
import { tryRun } from './isomorphic_queries';
import { strict as assert } from 'assert';

export default async function client_files(db: Required<DBHandlerClient>, auth: Auth, log: (...args: any[]) => any, methods, tableSchema: DBSchemaTable[]){
   
  await tryRun("Files table is present", async () => {
    let files = await db.files.find!();
    assert.deepStrictEqual(files, []);
 
    const file = { 
      data: Buffer.from("This is a string", "utf-8"), 
      name: "sample_file.txt" 
    };

    const inserted = await db.users_public_info.insert!({ name: "somename.txt", avatar: file }, { returning: "*" });
    files = await db.files.find!();
    assert.equal(files.length, 1);
    assert.equal(files[0].id, inserted.avatar.id);
    assert.equal(files[0].original_name, file.name);

    try {

      await db.files.insert!(file);
      throw "Should not be able to insert files directly"
    } catch (err){
      assert.equal(err.message.startsWith("Direct inserts not allowed"), true);
    }
    await db.users_public_info.delete!();
    await db.files.delete!();
    files = await db.files.find!();
    assert.deepStrictEqual(files, []);
  });

}