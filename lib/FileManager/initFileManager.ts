import * as fs from "fs";
import { asName, tryCatch } from "prostgles-types";
import { TableHandler } from "../DboBuilder/TableHandler/TableHandler";
import { canCreateTables } from "../DboBuilder/runSQL";
import { Prostgles } from "../Prostgles";
import { FileManager, HOUR, LocalConfig } from "./FileManager";
import { runClientRequest } from "../runClientRequest";
import { HTTP_FAIL_CODES } from "../Auth/AuthHandler";

export async function initFileManager(this: FileManager, prg: Prostgles) {
  this.prostgles = prg;

  const { fileTable } = prg.opts;
  if (!fileTable) {
    throw "fileTable missing";
  }
  const { tableName = "files", referencedTables = {} } = fileTable;
  this.tableName = tableName;

  const maxBfSizeMB = (prg.opts.io?.engine.opts.maxHttpBufferSize || 1e6) / 1e6;
  console.log(
    `Prostgles: Initiated file manager. Max allowed file size: ${maxBfSizeMB}MB (maxHttpBufferSize = 1e6). To increase this set maxHttpBufferSize in socket.io server init options`
  );

  const canCreate = await canCreateTables(this.db);
  const runQuery = async (q: string, debugInfo: string): Promise<void> => {
    const res = await tryCatch(async () => {
      if (!canCreate)
        throw "File table creation failed. Your postgres user does not have CREATE table privileges";
      await this.db.any(q);
    });
    await this.prostgles?.opts.onLog?.({
      type: "debug",
      command: "initFileManager.runQuery",
      ...res,
      data: { debugInfo },
    });
    if (res.error) {
      throw res.error;
    }
  };
  /**
   * 1. Create media table
   */
  if (!this.dbo[tableName]) {
    await runQuery(
      `
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE TABLE IF NOT EXISTS ${asName(tableName)} (
        name                  TEXT NOT NULL,
        extension             TEXT NOT NULL,
        content_type          TEXT NOT NULL,
        content_length        BIGINT NOT NULL DEFAULT 0,
        added                 TIMESTAMP NOT NULL DEFAULT NOW(),
        url                   TEXT NOT NULL,
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        original_name         TEXT NOT NULL,
        description           TEXT,
        cloud_url             TEXT,
        signed_url            TEXT,
        signed_url_expires    BIGINT,
        etag                  TEXT,
        deleted               BIGINT,
        deleted_from_storage  BIGINT,
        UNIQUE(id),
        UNIQUE(name)
    )`,
      `Create fileTable ${asName(tableName)}`
    );
    await prg.refreshDBO();
  }

  /**
   * 2. Create media lookup tables
   */
  for (const refTable in referencedTables) {
    if (!this.dbo[refTable]) {
      throw `Referenced table (${refTable}) from fileTable.referencedTables prostgles init config does not exist`;
    }
    const cols = await (this.dbo[refTable] as TableHandler).getColumns();

    const tableConfig = referencedTables[refTable]!;

    for (const [colName] of Object.entries(tableConfig.referenceColumns)) {
      const existingCol = cols.find((c) => c.name === colName);
      if (existingCol) {
        if (existingCol.references?.some(({ ftable }) => ftable === tableName)) {
          // All ok
        } else {
          if (existingCol.udt_name === "uuid") {
            try {
              const query = `ALTER TABLE ${asName(refTable)} ADD FOREIGN KEY (${asName(colName)}) REFERENCES ${asName(tableName)} (id) ;`;
              const msg = `Referenced file column ${refTable} (${colName}) exists but is not referencing file table. Add REFERENCE constraint...\n${query}`;
              await runQuery(query, msg);
            } catch (e) {
              console.error(
                `Could not add constraing. Err: ${e instanceof Error ? e.message : JSON.stringify(e)}`
              );
            }
          } else {
            console.error(
              `Referenced file column ${refTable} (${colName}) exists but is not of required type (UUID). Choose a different column name or ALTER the existing column to match the type and the data found in file table ${tableName}(id)`
            );
          }
        }
      } else {
        const query = `ALTER TABLE ${asName(refTable)} ADD COLUMN ${asName(colName)} UUID REFERENCES ${asName(tableName)} (id);`;
        // const createColumn = async () => {
        //   try {
        //     const msg = `Create referenced file column ${refTable} (${colName})...\n${query}`;
        //     await runQuery(query, msg);
        //   } catch(e){
        //     console.error(`FAILED. Err: ${e instanceof Error? e.message : JSON.stringify(e)}`)
        //   }
        // }
        // await createColumn();
        console.error(
          `Referenced file column ${refTable} (${colName}) does not exist. Create it using this query:\n${query}`
        );
      }
    }

    await prg.refreshDBO();
  }

  /**
   * 4. Serve media through express
   */
  const { fileServeRoute = `/${tableName}`, expressApp: app } = fileTable;

  if (fileServeRoute.endsWith("/")) {
    throw `fileServeRoute must not end with a '/'`;
  }
  this.fileRoute = fileServeRoute;

  app.get(this.fileRouteExpress, async (req, res) => {
    if (!this.dbo[tableName]) {
      res
        .status(HTTP_FAIL_CODES.INTERNAL_SERVER_ERROR)
        .json(`Internal error: media table (${tableName}) not valid`);
      return false;
    }

    const mediaTable = this.dbo[tableName] as unknown as TableHandler;

    try {
      const { name } = req.params;
      if (typeof name !== "string" || !name) {
        throw "Invalid media name";
      }
      if (!this.prostgles) {
        throw "Prostgles instance missing";
      }
      const id = name.slice(0, 36);
      const selectParams = {
        select: {
          id: 1,
          name: 1,
          signed_url: 1,
          signed_url_expires: 1,
          content_type: 1,
        },
      };
      const media = await runClientRequest.bind(this.prostgles)({
        type: "http",
        httpReq: req,
        command: "findOne",
        tableName,
        param1: { id },
        param2: selectParams,
        param3: undefined,
      });

      if (!media) {
        res.status(HTTP_FAIL_CODES.NOT_FOUND).send("File not found or not allowed");
        return;
      }

      if (this.cloudClient) {
        let url = media.signed_url;
        const expires = +(media.signed_url_expires || 0);

        const EXPIRES = Date.now() + HOUR;
        if (!url || expires < EXPIRES) {
          url = await this.getFileCloudDownloadURL(media.name, 60 * 60);
          await mediaTable.update({ name }, { signed_url: url, signed_url_expires: EXPIRES });
        }

        res.redirect(url);
      } else {
        const pth = `${(this.config as LocalConfig).localFolderPath}/${media.name}`;
        if (!fs.existsSync(pth)) {
          throw new Error("File not found");
        }
        res.contentType(media.content_type);
        res.sendFile(pth);
      }
    } catch (e) {
      console.log(e);
      res.status(HTTP_FAIL_CODES.BAD_REQUEST).send("Invalid/disallowed file");
    }
  });
}
