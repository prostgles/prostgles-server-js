import * as fs from "fs";
import * as path from "path";
import { getObjectEntries } from "prostgles-types";
import { getResolvedTypes } from "./getResolvedTypes";
import { renderTsType } from "./renderTsType";
import { TS_Object } from "./getSerializableType/getSerializableType";

const testFolderPath = `${__dirname}/../../../tests/`;
const docsFolder = `${__dirname}/../../`;

export const generateServerDocs = () => {
  const serverFilePath = path.resolve(
    `${testFolderPath}/server/node_modules/prostgles-server/dist/ProstglesTypes.d.ts`, // "ProstglesInitOptions",
  );
  const {
    resolvedTypes: [ProstglesInitOptions],
  } = getResolvedTypes({
    filePath: serverFilePath,
    filter: {
      nodeNames: ["ProstglesInitOptions"],
      excludedTypes: [
        "ExpressApp",
        "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>",
        "Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any> | undefined",
        "IConnectionParameters<IClient>",
        "Express",
        "DB",
        "IEventContext<IClient>",
      ],
      excludedFilenameParts: ["node_modules/engine.io"],
      maxDepth: 5,
    },
    // outputFilename: "serverTypes",
  });

  const prostglesInitOpts = ProstglesInitOptions as TS_Object; //as (typeof import("./serverTypes").definitions)[0];
  if (!ProstglesInitOptions || !prostglesInitOpts)
    throw new Error("ProstglesInitOptions not found");

  const configurationPropsMarkdown = getObjectEntries(prostglesInitOpts.properties).map(
    ([propName, prop]) => {
      return renderTsType(prop, 0, { name: propName, optional: prop.optional });
    },
  );

  const docs = [
    `# Overview`,
    `Prostgles allows connecting to a PostgreSQL database to get a realtime view of the data and schema changes. `,
    `By configuring \`tsGeneratedTypesDir\` the database schema types are generated automatically allowing full end-to-end type safety`,
    `### Installation`,
    `To install the package, run:`,
    `\`\`\`bash`,
    `npm install prostgles-server`,
    `\`\`\``,
    `### Configuration`,
    `To get started, you need to provide a configuration object to the server.`,
    ``,
    `Minimal configuration:`,
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
    ``,
    `To allow clients to connect an express server with socket.io needs to be configured:`,
    `\`\`\`typescript`,
    `import prostgles from "prostgles-server";`,
    `import { DBGeneratedSchema } from "./DBGeneratedSchema";`,
    `import express from "express";`,
    `import path from "path";`,
    `import http from "http";`,
    `import { Server } from "socket.io";`,
    ``,
    `const app = express();`,
    `const httpServer = http.createServer(app);`,
    `httpServer.listen(30009);`,
    `const io = new Server(httpServer, {`,
    `  path: "/prgl-api",`,
    `});`,
    ``,
    `prostgles<DBGeneratedSchema>({`,
    `  dbConnection: {`,
    `    host: "localhost",`,
    `    port: 5432,`,
    `    database: "postgres"`,
    `    user: process.env.PRGL_USER,`,
    `    password: process.env.PRGL_PWD`,
    `  },`,
    `  io,`,
    `  publish: () => {`,
    `    return {`,
    `      items: "*",`,
    `    }`,
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
  ].join("\n");

  fs.writeFileSync(`${docsFolder}01_Server_setup.md`, docs, { encoding: "utf-8" });

  fs.writeFileSync(
    `${docsFolder}02_Server_configuration.md`,
    [`### Configuration options`, configurationPropsMarkdown.join("\n")].join("\n\n"),
    { encoding: "utf-8" },
  );
};
