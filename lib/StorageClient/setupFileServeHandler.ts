import type e from "express";
import * as fs from "fs";
import { join } from "path";
import { HTTP_FAIL_CODES, removeExpressRoute } from "../Auth/AuthHandler";
import type { DB } from "../initProstgles";
import type { Prostgles } from "../Prostgles";
import type { FileTableConfig } from "../ProstglesTypes";
import { runClientRequest } from "../runClientRequest";
import type { FileVersionTableRow } from "./fileTableDefinitions";
import { getFileVersionTableName } from "./fileVersionUtils";
import { getFileStorageKey } from "./getFileStorageKey";
import type { FileTableRow } from "./getFileTableConfig";
import type { StorageClient } from "./StorageClientTypes";

export const getFileServeRoute = (config: FileTableConfig) => {
  const fileTableName = config.tableName;
  const fileServeRoute = config.fileServePath ?? `/${fileTableName}`;
  if (fileServeRoute.endsWith("/")) {
    throw `fileServeRoute must not end with a '/'`;
  }
  return fileServeRoute;
};

export const setupFileServeHandler = (
  db: DB,
  config: FileTableConfig,
  storageClient: StorageClient,
  app: e.Express,
  prg: Prostgles,
) => {
  const fileTableName = config.tableName;
  const fileServeRoute = getFileServeRoute(config);
  const fileRouteExpress = fileServeRoute + "/:id";

  app.get(fileRouteExpress, async (req, res) => {
    try {
      const { id } = req.params;
      if (typeof id !== "string" || !id) {
        throw "Invalid media name";
      }
      const versionParam = req.query.version;
      const version = typeof versionParam === "string" ? Number(versionParam) : undefined;
      if (
        versionParam !== undefined &&
        (typeof versionParam !== "string" ||
          !Number.isInteger(version) ||
          version! < 1 ||
          String(version) !== versionParam)
      ) {
        throw "Invalid file version";
      }

      if (version && !config.versioning) {
        throw "File version requested but versioning is not enabled";
      }

      const select = {
        id: 1,
        storage_key: 1,
        signed_url: 1,
        signed_url_expires: 1,
        content_type: 1,
      } satisfies
        Partial<Record<keyof FileTableRow, 1>> | Partial<Record<keyof FileVersionTableRow, 1>>;

      const file = (await runClientRequest.bind(prg)(
        {
          command: "findOne",
          tableName: version === undefined ? fileTableName : getFileVersionTableName(config),
          param1: version === undefined ? { id } : { file_id: id, version },
          param2: {
            select,
          },
          param3: undefined,
        },
        {
          res,
          httpReq: req,
        },
        undefined,
      )) as Pick<FileTableRow, keyof typeof select> | undefined;

      if (!file) {
        res
          .status(HTTP_FAIL_CODES.NOT_FOUND)
          .send(version === undefined ? "File not found or not allowed" : "File version not found");
        return;
      }

      if (storageClient.type === "cloud") {
        let url = version === undefined ? file.signed_url : undefined;
        const expires = version === undefined ? +(file.signed_url_expires || 0) : 0;

        const HOUR = 3600 * 1000;
        const EXPIRES = Date.now() + HOUR;
        if (!url || expires < EXPIRES) {
          url = await storageClient.getSignedUrlForDownload(getFileStorageKey(file), 60 * 60);

          // Match the storage key to avoid caching a stale URL after replacement; NULL matches legacy files.
          if (version === undefined) {
            await db.any(
              "UPDATE ${fileTableName:name} \
              SET signed_url = ${signed_url}, \
              signed_url_expires = ${signed_url_expires} \
            WHERE id = ${id} \
            AND storage_key IS NOT DISTINCT FROM ${storage_key}::uuid",
              {
                fileTableName,
                id: file.id,
                storage_key: file.storage_key,
                signed_url: url,
                signed_url_expires: EXPIRES,
              },
            );
          }
        }

        res.redirect(url);
      } else {
        const localFilePath = join(storageClient.localFolderPath, getFileStorageKey(file));
        if (!fs.existsSync(localFilePath)) {
          throw new Error("File not found");
        }
        res.contentType(file.content_type);
        res.sendFile(localFilePath, { dotfiles: "allow" });
      }
    } catch (e) {
      console.log(e);
      res.status(HTTP_FAIL_CODES.BAD_REQUEST).send("Invalid/disallowed file");
    }
  });

  const destroy = () => {
    removeExpressRoute(app, [fileRouteExpress]);
  };

  return { destroy };
};
