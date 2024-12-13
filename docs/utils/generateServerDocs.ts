import * as fs from "fs";
import * as path from "path";
import { getResolvedTypes } from "./getResolvedTypes";
import { definitions } from "./serverTypes";
import { getObjectEntries } from "prostgles-types";
import { TS_Type } from "./getSerializableType";
import { renderTsType } from "./renderTsType";

const testFolderPath = `${__dirname}/../../../tests/`;
const docsFolder = `${__dirname}/../../`;

export const generateServerDocs = () => {
  const serverFilePath = path.resolve(
    // `${testFolderPath}/server/node_modules/prostgles-server/dist/DBSchemaBuilder.d.ts` // "DBOFullyTyped",
    `${testFolderPath}/server/node_modules/prostgles-server/dist/ProstglesTypes.d.ts` // "ProstglesInitOptions",
  );
  const {
    resolvedTypes: [ProstglesInitOptions],
  } = getResolvedTypes({
    filePath: serverFilePath,
    filter: {
      nodeNames: [
        "ProstglesInitOptions",
        // "DBOFullyTyped",
      ],
      excludedTypes: ["Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>"],
      maxDepth: 4,
    },
  });

  const serverTypesStr = [
    `import type { TS_Type } from "./getSerializableType";`,
    `export const definitions = ${JSON.stringify([ProstglesInitOptions], null, 2)} as const satisfies TS_Type[];`,
  ].join("\n");
  fs.writeFileSync(`${docsFolder}/utils/serverTypes.ts`, serverTypesStr, { encoding: "utf-8" });

  const prostglesInitOpts = definitions[0];
  if (!ProstglesInitOptions || !prostglesInitOpts)
    throw new Error("ProstglesInitOptions not found");

  const configurationPropsMarkdown = getObjectEntries(prostglesInitOpts.properties).map(
    ([propName, prop]) => {
      return renderTsType(prop, 0, { name: propName, optional: prop.optional });
    }
  );
  const docs = [
    `# Overview`,
    `Our Isomorphic Typescript API allows connecting to a PostgreSQL database to get a realtime view of the data and schema. Interact with the data with full end-to-end type safety.`,
    `### Installation`,
    `To install the package, run:`,
    `\`\`\`bash`,
    `npm install prostgles-server`,
    `\`\`\``,
    `### Configuration`,
    `To get started, you need to provide a configuration object to the server.`,
    ``,
    `Basic example:`,
    `\`\`\`typescript`,
    `import prostgles from "prostgles-server";`,
    `import { DBGeneratedSchema } from "./DBGeneratedSchema";`,
    `prostgles<DBGeneratedSchema>({`,
    `  dbConnection: {`,
    `    host: "localhost",`,
    `    port: 5432,`,
    `    database: "postgres"`,
    `    user: process.env.PRGL_USER,`,
    `    password: process.env.PRGL_PWD`,
    `  },`,
    `  tsGeneratedTypesDir: __dirname,`,
    `  onReady: async ({ dbo }) => {`,
    `    try {`,
    `      await dbo.items.insert({ name: "a" });`,
    `      console.log(await dbo.items.find());`,
    `    } catch(err) {`,
    `      console.error(err)`,
    `    }`,
    `  },`,
    `});`,
    `\`\`\``,
    `### Configuration options`,
    configurationPropsMarkdown.join("\n\n"),
  ].join("\n");

  fs.writeFileSync(`${docsFolder}SERVER.md`, docs, { encoding: "utf-8" });
};
