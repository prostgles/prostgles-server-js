import * as fs from "fs";
import * as path from "path";
import { getObjectEntries, isDefined, TableHandler } from "prostgles-types";
import { definitions } from "./clientTypes";
import { getMethodsDocs } from "./getMethodsDocs";
import { getResolvedTypes } from "./getResolvedTypes";
import { TS_Type } from "./getSerializableType";

const testFolderPath = `${__dirname}/../../../tests/`;
const docsFolder = `${__dirname}/../../`;

export const generateClientDocs = () => {
  const clientFilePath = path.resolve(
    `${testFolderPath}/client/node_modules/prostgles-client/dist/prostgles.d.ts`
  );
  const excludedTypes = [
    // "FullFilter",
    // "FullFilter<T, S> | undefined",
    "FieldFilter | undefined",
    "SyncOptions",
    "SyncOneOptions",
    "PG_COLUMN_UDT_DATA_TYPE",
  ];
  const { resolvedTypes, visitedMaps } = getResolvedTypes({
    filePath: clientFilePath,
    filter: {
      nodeNames: ["TableHandlerClient"],
      excludedTypes,
    },
  });

  const jsonTypes = JSON.stringify(
    [
      ...resolvedTypes,
      ...visitedMaps
        .flatMap((m) =>
          Array.from(m.values()).map((v) =>
            excludedTypes.includes(v.resolvedType.alias ?? "") ? v.resolvedType : undefined
          )
        )
        .filter(isDefined),
    ] satisfies TS_Type[],
    null,
    2
  );
  fs.writeFileSync(
    `${__dirname}/../clientTypes.ts`,
    [
      `import type { TS_Type } from "./getSerializableType";`,
      `export const definitions = ${jsonTypes} as const satisfies TS_Type[];`,
    ].join("\n"),
    {
      encoding: "utf-8",
    }
  );

  const docPath = `${docsFolder}METHODS.md`;

  const tableHandler = definitions[0];
  const isomotphicMethodNames = {
    count: 1,
    delete: 1,
    find: 1,
    insert: 1,
    update: 1,
    findOne: 1,
    getColumns: 1,
    getInfo: 1,
    size: 1,
    subscribe: 1,
    subscribeOne: 1,
    updateBatch: 1,
    upsert: 1,
  } satisfies Record<keyof TableHandler, 1>;

  const isomorphicMd = getMethodsDocs(
    getObjectEntries(tableHandler.properties).filter(
      ([methodName]) => isomotphicMethodNames[methodName]
    )
  );
  const clientMd = getMethodsDocs(
    getObjectEntries(tableHandler.properties).filter(
      ([methodName]) => !isomotphicMethodNames[methodName]
    )
  );

  const result = [
    `# Isomorphic Methods`,
    ``,
    `The following table/view methods are available on the client and server.`,
    ``,
    isomorphicMd.join("\n\n"),

    `# Client-only Methods`,
    ``,
    `The following table/view methods are available on the client.`,
    ``,
    clientMd.join("\n\n"),
  ].join("\n");

  fs.writeFileSync(docPath, result, { encoding: "utf-8" });
};
