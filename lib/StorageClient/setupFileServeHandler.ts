import type e from "express";
import * as fs from "fs";
import { join } from "path";
import { HTTP_FAIL_CODES, removeExpressRoute } from "../Auth/AuthHandler";
import type { DB } from "../initProstgles";
import type { Prostgles } from "../Prostgles";
import type { FileTableConfig } from "../ProstglesTypes";
import { runClientRequest } from "../runClientRequest";
import type { StorageClient } from "./StorageClientTypes";
import type { FileTableRow } from "./getFileTableConfig";

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

      const selectParams = {
        select: {
          id: 1,
          signed_url: 1,
          signed_url_expires: 1,
          content_type: 1,
        },
      };
      const file = (await runClientRequest.bind(prg)(
        {
          command: "findOne",
          tableName: fileTableName,
          param1: { id },
          param2: selectParams,
          param3: undefined,
        },
        {
          res,
          httpReq: req,
        },
        undefined,
      )) as FileTableRow | undefined;

      if (!file) {
        res.status(HTTP_FAIL_CODES.NOT_FOUND).send("File not found or not allowed");
        return;
      }

      if (storageClient.type === "cloud") {
        let url = file.signed_url;
        const expires = +(file.signed_url_expires || 0);

        const HOUR = 3600 * 1000;
        const EXPIRES = Date.now() + HOUR;
        if (!url || expires < EXPIRES) {
          url = await storageClient.getSignedUrlForDownload(file.id, 60 * 60);

          await db.any(
            "UPDATE ${fileTableName:name} SET signed_url = ${signed_url}, signed_url_expires = ${signed_url_expires} WHERE id = ${id}",
            {
              fileTableName,
              id: file.id,
              signed_url: url,
              signed_url_expires: EXPIRES,
            },
          );
        }

        res.redirect(url);
      } else {
        const localFilePath = join(storageClient.localFolderPath, file.id);
        if (!fs.existsSync(localFilePath)) {
          throw new Error("File not found");
        }
        res.contentType(file.content_type);
        res.sendFile(localFilePath);
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
