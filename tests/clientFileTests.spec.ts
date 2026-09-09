import { strict as assert } from "assert";
import fs from "fs";
import { describe, test } from "node:test";
import type { DBHandlerClient } from "./client";
import type { AnyObject, SQLHandler } from "prostgles-types";

export const clientFileTests = async (db: DBHandlerClient, sql: SQLHandler) => {
  await describe("clientFileTests", async () => {
    const fileFolder = `${__dirname}/../../server/dist/server/media/`;
    const getFiles = () => sql?.("SELECT id, original_name FROM files", {}, { returnType: "rows" });
    await sql?.(
      `
      ALTER TABLE users_public_info 
      DROP CONSTRAINT "users_public_info_avatar_fkey";

      ALTER TABLE "users_public_info"
      ADD FOREIGN KEY ("avatar")
      REFERENCES "files" ("id")
      ON DELETE SET NULL
    `,
      {},
    );
    const initialFiles = await getFiles();

    /**
     * Although only users_public_info is published,
     * file table should show because it is referenced by users_public_info
     * and show only show files that are referenced by users_public_info
     */
    await test("Files table is present", async () => {
      const files = await db.files.find!();
      assert.deepStrictEqual(files, []);
    });

    const file = {
      data: Buffer.from("This is a string", "utf-8"),
      original_name: "sample_file.txt",
    };
    let insertedFile: AnyObject;
    await test("Insert file from nested insert", async () => {
      const nestedInsert = await db.users_public_info.insert!(
        { name: "somename.txt", avatar: file },
        { returning: "*" },
      );
      const files = await db.files.find!();
      assert.equal(files.length, 1);
      assert.equal(files[0].id, nestedInsert.avatar.id);
      assert.equal(files[0].original_name, file.original_name);
      const initialFileStr = fs.readFileSync(fileFolder + files[0].storage_key).toString("utf8");
      assert.equal(file.data.toString(), initialFileStr);
      insertedFile = files[0];
    });

    await test("Cannot Insert file directly", async () => {
      try {
        await db.files.insert!(file, { returning: "*" });
        throw "Should not be able to insert files directly";
      } catch (err: any) {
        assert.equal(err.message.startsWith("Direct inserts not allowed"), true);
      }
    });

    await test("Disallowed updates cannot change stored bytes or create nested uploads", async () => {
      const before = fs.readdirSync(fileFolder).sort();
      await sql("UPDATE users_public_info SET sid = 'another-user' WHERE avatar = $1", [
        insertedFile.id,
      ]);
      try {
        assert.ok(!(await db.files.findOne!({ id: insertedFile.id })));
        const rows = await db.files.update!(
          { id: insertedFile.id },
          {
            data: Buffer.from("unauthorized replacement"),
            original_name: "forbidden.txt",
          },
          { returning: "*" },
        );
        assert.deepEqual(rows, []);
        assert.deepEqual(
          await db.users_public_info.update!(
            { avatar: insertedFile.id },
            { avatar: file },
            { returning: "*" },
          ),
          [],
        );
        assert.equal(
          fs.readFileSync(fileFolder + insertedFile.storage_key, "utf8"),
          file.data.toString(),
        );
        assert.deepEqual(fs.readdirSync(fileFolder).sort(), before);
      } finally {
        await sql("UPDATE users_public_info SET sid = 'files' WHERE avatar = $1", [
          insertedFile.id,
        ]);
      }
    });

    await test("Duplicate file IDs and failed validation preserve the original object", async () => {
      const before = fs.readdirSync(fileFolder).sort();
      await assert.rejects(() =>
        db.users_public_info.insert!({
          name: "duplicate",
          avatar: {
            ...file,
            id: insertedFile.id,
            data: Buffer.from("collision"),
          },
        }),
      );
      await assert.rejects(() =>
        db.files.update!(
          { id: insertedFile.id },
          { data: Buffer.from("invalid"), original_name: "missing-extension" },
        ),
      );
      assert.equal(
        fs.readFileSync(fileFolder + insertedFile.storage_key, "utf8"),
        file.data.toString(),
      );
      assert.deepEqual(fs.readdirSync(fileFolder).sort(), before);
    });

    await test("Can update allowed files directly", async () => {
      const newData = {
        data: Buffer.from("# Replacement markdown", "utf-8"),
        original_name: "replacement.md",
      };
      await db.files.update!({ id: insertedFile.id }, newData);
      const newFiles = await db.files.find!();
      assert.equal(newFiles.length, 1);
      const [newFile] = newFiles;
      assert.equal(newFile?.original_name, newData.original_name);
      assert.equal(newFile.id, insertedFile.id);
      assert.equal(newFile.content_type, "text/markdown");
      assert.equal(newFile.extension, "md");
      assert.equal(
        fs
          .readFileSync(fileFolder + newFile.storage_key)
          .toString("utf8")
          .toString(),
        newData.data.toString(),
      );
      assert.notEqual(newFile.storage_key, insertedFile.storage_key);
      assert.equal(fs.existsSync(fileFolder + insertedFile.storage_key), false);
    });

    await test("Can insert allowed files through a nested update", async () => {
      await db.files.delete!();
      const user = await db.users_public_info.findOne!();
      const newData = {
        data: Buffer.from("nestedupdate", "utf-8"),
        original_name: "nestedupdate.txt",
      };
      const d = await db.users_public_info.update!(
        { id: user?.id },
        { avatar: newData },
        { returning: "*" },
      );
      const avatarRow = d?.at(0)?.avatar;
      const avatarFile = await db.files.findOne?.({ id: avatarRow.id });
      const initialFileStr = fs.readFileSync(fileFolder + avatarFile?.storage_key).toString("utf8");
      assert.equal(newData.data.toString(), initialFileStr);
    });

    await test("Can delete only allowed files directly", async () => {
      const users = await db.users_public_info.find!();
      for (const user of users) {
        await db.files.delete!({ id: user.avatar.id });
        await db.users_public_info.delete!({ id: user.id });
      }

      await db.users_public_info.delete!();
      const files = await db.files.find!();
      assert.deepStrictEqual(files, []);
      const latestFiles = await getFiles();
      assert.equal(initialFiles?.length, latestFiles?.length);
    });
  });
};
