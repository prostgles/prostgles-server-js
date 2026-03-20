# Overview
Prostgles allows connecting to a PostgreSQL database to get a realtime view of the data and schema changes. 
By configuring `tsGeneratedTypesDir` the database schema types are generated automatically allowing full end-to-end type safety
### Installation
To install the package, run:
```bash
npm install prostgles-server
```
### Configuration
To get started, you need to provide a configuration object to the server.

Minimal configuration:
```typescript
import prostgles from "prostgles-server";
import { DBGeneratedSchema } from "./DBGeneratedSchema";
prostgles<DBGeneratedSchema>({
  dbConnection: {
    host: "localhost",
    port: 5432,
    database: "postgres"
    user: process.env.PRGL_USER,
    password: process.env.PRGL_PWD
  },
  tsGeneratedTypesDir: __dirname,
  onReady: async ({ dbo }) => {
    try {
      await dbo.items.insert({ name: "a" });
      console.log(await dbo.items.find());
    } catch(err) {
      console.error(err)
    }
  },
});
```

To allow clients to connect an express server with socket.io needs to be configured:
```typescript
import prostgles from "prostgles-server";
import { DBGeneratedSchema } from "./DBGeneratedSchema";
import express from "express";
import path from "path";
import http from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = http.createServer(app);
httpServer.listen(30009);
const io = new Server(httpServer, {
  path: "/prgl-api",
});

prostgles<DBGeneratedSchema>({
  dbConnection: {
    host: "localhost",
    port: 5432,
    database: "postgres"
    user: process.env.PRGL_USER,
    password: process.env.PRGL_PWD
  },
  io,
  publish: () => {
    return {
      items: "*",
    }
  },
  tsGeneratedTypesDir: __dirname,
  onReady: async ({ dbo }) => {
    try {
      await dbo.items.insert({ name: "a" });
      console.log(await dbo.items.find());
    } catch(err) {
      console.error(err)
    }
  },
});
```