
import { DBSchemaTable } from "prostgles-types";
import type { AuthHandler, DBHandlerClient } from "./client";
import { strict as assert } from 'assert';
import fs from "fs";
import { describe, test } from "node:test";

export const clientFileTests = async (db: DBHandlerClient, auth: AuthHandler, log: (...args: any[]) => any, methods, tableSchema: DBSchemaTable[]) => {
   
  await describe("clientFileTests", async () => {
      
    const fileFolder = `${__dirname}/../../server/dist/server/media/`;
    const getFiles = () => db.sql("SELECT id, original_name FROM files", { }, { returnType: "rows" })
    await db.sql(`
      ALTER TABLE users_public_info 
      DROP CONSTRAINT "users_public_info_avatar_fkey";

      ALTER TABLE "users_public_info"
      ADD FOREIGN KEY ("avatar")
      REFERENCES "files" ("id")
      ON DELETE SET NULL
    `, { })
    const initialFiles = await getFiles();

    await test("Files table is present", async () => {
      const files = await db.files.find!();
      assert.deepStrictEqual(files, []); 
    });


    const file = { 
      data: Buffer.from("This is a string", "utf-8"), 
      name: "sample_file.txt" 
    };
    let insertedFile;
    await test("Insert file from nested insert", async () => {
      const nestedInsert = await db.users_public_info.insert!({ name: "somename.txt", avatar: file }, { returning: "*" });
      const files = await db.files.find!();
      assert.equal(files.length, 1);
      assert.equal(files[0].id, nestedInsert.avatar.id);
      assert.equal(files[0].original_name, file.name);
      const initialFileStr = fs.readFileSync(fileFolder + files[0].name).toString('utf8');
      assert.equal(file.data.toString(), initialFileStr);
      insertedFile = files[0]
    });

    await test("Cannot Insert file directly", async () => {
      try {
        await db.files.insert!(file, { returning: "*" });
        throw "Should not be able to insert files directly"
      } catch (err){
        assert.equal(err.message.startsWith("Direct inserts not allowed"), true);
      }
    });

    await test("Can update allowed files directly", async () => {
      const newData =  { 
        data: Buffer.from("aa", "utf-8"), 
        name: "a.txt" 
      }
      await db.files.update!({ id: insertedFile.id }, newData);
      const newFiles = await db.files.find!();
      assert.equal(newFiles.length, 1);
      const [newFile] = newFiles;
      assert.equal(newFile?.original_name, newData.name);
      assert.equal(newFile.id, insertedFile.id);
      assert.equal(
        fs.readFileSync(fileFolder + newFile.name).toString('utf8').toString(),
        newData.data.toString()
      );
    });

    await test("Can insert allowed files through a nested update", async () => {

      await db.files.delete!();
      const user = await db.users_public_info.findOne!();
      const newData =  { 
        data: Buffer.from("nestedupdate", "utf-8"), 
        name: "nestedupdate.txt" 
      }
      const d = await db.users_public_info.update!({ id: user?.id }, { avatar: newData }, { returning: "*" });
      const avatarFile = await db.files.findOne!({ id: d?.at(0).avatar.id });
      const initialFileStr = fs.readFileSync(fileFolder + avatarFile!.name).toString('utf8');
      assert.equal(newData.data.toString(), initialFileStr);
    });

    await test("Can delete only allowed files directly", async () => {
      const users = await db.users_public_info.find!();
      for await(const user of users){
        await db.files.delete!({ id: user.avatar.id });
        await db.users_public_info.delete!({ id: user.id });
      }

      await db.users_public_info.delete!();
      const files = await db.files.find!();
      assert.deepStrictEqual(files, []);
      const latestFiles = await getFiles() 
      assert.equal(initialFiles.length, latestFiles.length);
    });

  });
}