import * as fs from "fs";
import * as path from "path";
import { getObjectEntries, TableHandler } from "prostgles-types";
import { getMethodsDocs } from "./getMethodsDocs";
import { getResolvedTypes } from "./getResolvedTypes";
import { TS_Object } from "./getSerializableType/getSerializableType";
import { renderTsType } from "./renderTsType";

const testFolderPath = `${__dirname}/../../../tests/`;
const docsFolder = `${__dirname}/../../`;

export const generateClientDocs = async (fromIndex: number) => {
  const clientFilePath = path.resolve(
    `${testFolderPath}/client/node_modules/prostgles-client/dist/prostgles.d.ts`
  );
  const excludedTypes = [
    "FullFilter",
    "FullFilter<T, S>",
    "FieldFilter",
    "SyncOptions",
    "PG_COLUMN_UDT_DATA_TYPE",
    "Socket<DefaultEventsMap, DefaultEventsMap>",
  ];
  const { resolvedTypes } = getResolvedTypes({
    filePath: clientFilePath,
    filter: {
      nodeNames: ["TableHandlerClient", "InitOptions"],
      excludedFilenameParts: ["node_modules/engine.io"],
      excludedTypes,
      maxDepth: 9,
    },
    // outputFilename: "clientTypes",
  });

  const tableHandler = resolvedTypes[0] as TS_Object; //(typeof import("./clientTypes").definitions)[0];
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

  const InitOptions = resolvedTypes[1] as TS_Object; // (typeof import("./clientTypes").definitions)[1];

  const configurationClientMarkdown = renderTsType(InitOptions, 0, undefined);
  const docs = [
    `# Overview`,
    `Client-side API for interacting with a PostgreSQL database.`,
    ``,
    `### Installation`,
    `To install the package, run:`,
    `\`\`\`bash`,
    `npm install prostgles-client`,
    `\`\`\``,
    ``,
    `### Configuration`,
    `Example react configuration and usage:`,
    `\`\`\`typescript`,
    `import prostgles from "prostgles-client";`,
    `import { DBGeneratedSchema } from "./DBGeneratedSchema";`,
    ``,
    `export const App = () => {`,
    ``,
    `  const prgl = useProstglesClient("/ws-api");`,
    ``,
    `  if(prgl.isLoading) return <div>Loading...</div>;`,
    `  return <MyComponent prgl={prgl} />;`,
    `}`,
    `\`\`\``,
    ``,
    `Example configuration:`,
    `\`\`\`typescript`,
    `import prostgles from "prostgles-client";`,
    `import { DBGeneratedSchema } from "./DBGeneratedSchema";`,
    `import io from "socket.io-client";`,
    `const socket = io({ path: "/ws-api" });`,
    ``,
    `const prostglesClient = prostgles<DBGeneratedSchema>`,
    `  socket,`,
    `  onReady: async (dbs, methods, schema, auth) => {`,
    `    console.log(dbs.items.find());`,
    `  }`,
    `})`,
    `\`\`\``,
    ``,
    `### Configuration options`,
    configurationClientMarkdown,
    ``,
    `# Client-only Methods`,
    ``,
    `The following table/view methods are available on client-side only.`,
    ``,
    clientMd
      .map((v) => v.split(" ")[1]?.split("<")[0])
      .filter((v) => v)
      .join(", "),
  ].join("\n");

  fs.writeFileSync(`${docsFolder}${toTwoDigit(fromIndex)}_Client_Setup.md`, docs, {
    encoding: "utf-8",
  });

  clientMd.forEach((methodContent, i) => {
    if (!methodContent) return;
    const methodName = methodContent.split(" ")[1]!.split("<")[0];
    fs.writeFileSync(
      `${docsFolder}${toTwoDigit(i + fromIndex + 1)}_${methodName}.md`,
      `> Available on client only\n\n` + methodContent,
      { encoding: "utf-8" }
    );
  });

  isomorphicMd.forEach((methodContent, i) => {
    const methodName = methodContent.split(" ")[1]!.split("<")[0];
    fs.writeFileSync(
      `${docsFolder}${toTwoDigit(i + fromIndex + 1 + clientMd.length)}_${methodName}.md`,
      methodContent,
      { encoding: "utf-8" }
    );
  });
};

const toTwoDigit = (num: number) => {
  return num.toString().padStart(2, "0");
};
