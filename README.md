# prostgles-server
  
  Isomorphic PostgreSQL client for [node](http://nodejs.org).  
  TypeScript, pg-promise, Socket.IO

[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/prostgles/prostgles-server-js/blob/master/LICENSE)
[![npm version](https://img.shields.io/npm/v/prostgles-server.svg?style=flat)](https://www.npmjs.com/package/prostgles-server)
[![Dependency Status](https://david-dm.org/prostgles/prostgles-server-js/status.svg)](https://david-dm.org/prostgles/prostgles-server-js/status.svg#info=dependencies)


## Features
 
  * CRUD operations 
  * Subscriptions to data changes
  * Policies and Rules for client data access
  * Client-Server data replication
  * Generated TypeScript Definition for Database schema

## Installation

```bash
$ npm install prostgles-server
```

## Quick start

```js
let prostgles = require('prostgles-server');

prostgles({
  dbConnection: {
    host: "localhost",
    port: "5432",
    user: process.env.PG_USER,
    password: process.env.PG_PASS
  },
  isReady: async (dbo) => {
  
    const posts = await dbo.posts.find(
      { title: { $ilike: "%car%" } }, 
      { 
        orderBy: { created: -1 }, 
        limit: 10 
      }
    );
    
  }
});
```

## Server-Client usage

server.js
```js
const express = require('express');
const app = express();
const path = require('path');
var http = require('http').createServer(app);
var io = require('socket.io')(http);
http.listen(3000);

let prostgles = require('prostgles-server');

prostgles({
  dbConnection: {
    host: "localhost",
    port: "5432",
    user: process.env.PRGL_USER,
    password: process.env.PRGL_PWD
  },
  io,
  publish: "*", // Full unrestricted access to the database
  isReady: async (dbo) => {
    
  }
});
```

./public/index.html
```html

	  
<!DOCTYPE html>
<html>
	<head>
        <title> Prostgles </title>
        
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script src="https://unpkg.com/socket.io-client@2.3.0/dist/socket.io.slim.js" type="text/javascript"></script>
        <script src="https://unpkg.com/prostgles-client@1.0.13/dist/prostgles.js" type="text/javascript"></script>	
	</head>
	<body>
        
    <div class="wrapper"></div>
    <canvas id="canvas" width="100%" height="100%"></canvas>
		<script>
            
      const socket = io();

      prostgles({
          socket, 
          isReady: async (db) => {
            
          }
      });

		</script>
	</body>
</html>


```


## License

  [MIT](LICENSE)