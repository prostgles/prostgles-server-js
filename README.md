# prostgles-server

Isomorphic PostgreSQL client for [node](http://nodejs.org)

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/prostgles/prostgles-server-js/blob/master/LICENSE)
[![npm version](https://img.shields.io/npm/v/prostgles-server.svg?style=flat)](https://www.npmjs.com/package/prostgles-server)
![Tests](https://github.com/prostgles/prostgles-server-js/actions/workflows/main.yml/badge.svg)

### New: JSONB schema runtime validation and TS types

<img src="https://prostgles.com/tsdef2.png" width="600px" style="max-width: 90vw; " />

## Features

- CRUD operations with end-to-end type safety
- Auto-Generated TypeScript Definition for Database schema
- Subscriptions to data and schema changes
- Fine grained access control
- Optimistic data replication

## Installation

```bash
$ npm install prostgles-server
```

## Quick start

```typescript
import prostgles from "prostgles-server";
import prostgles from "prostgles-server";

prostgles({
  dbConnection: {
    host: "localhost",
    port: "5432",
    user: process.env.PG_USER,
    password: process.env.PG_PASS,
  },
  tsGeneratedTypesDir: __dirname,
  onReady: async ({ dbo }) => {
    const posts = await dbo.posts.find(
      { title: { $ilike: "%car%" } },
      {
        orderBy: { created: -1 },
        limit: 10,
      },
    );
  },
});
```

## Server-Client usage

server.js

```js
const express = require("express");
const app = express();
const path = require("path");
var http = require("http").createServer(app);
var io = require("socket.io")(http);
http.listen(3000);

let prostgles = require("prostgles-server");

prostgles({
  dbConnection: {
    host: "localhost",
    port: "5432",
    user: process.env.PRGL_USER,
    password: process.env.PRGL_PWD,
  },
  io,
  publish: "*", // Unrestricted INSERT/SELECT/UPDATE/DELETE access to the tables in the database
  onReady: async (dbo) => {},
});
```

react.tsx

```js
const App = () => {
  const { isLoading, dbo } = useProstglesClient();
  if (isLoading) return null;
  return <>Database tables: {Object.keys(dbo)}</>;
};
```

./public/index.html

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Prostgles</title>

    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script
      src="https://unpkg.com/socket.io-client@latest/dist/socket.io.min.js"
      type="text/javascript"
    ></script>
    <script
      src="https://unpkg.com/prostgles-client@latest/dist/index.js"
      type="text/javascript"
    ></script>
  </head>
  <body>
    <script>
      prostgles({
        socket: io(),
        onReady: async ({ dbo, dbsMethods, schemaTables, auth }) => {},
      });
    </script>
  </body>
</html>
```

## License

[MIT](LICENSE)
