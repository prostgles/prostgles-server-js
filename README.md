## Installing

```
$ npm install prostgles-server
```

## Local Usage

```js
let prostgles = require('prostgles-server');

prostgles({
  dbConnection: {
    host: "localhost",
    port: "5432",
    user: process.env.PRGL_USER,
    password: process.env.PRGL_PWD
  },
  isReady: async (dbo) => {
  
    const users = await dbo.users.find(
      { }, 
      { orderBy: { created: -1 }, limit: 10 }
    );
    
  }
});
```


## Server-client usage

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
  publish: "*",
  isReady: async (dbo) => {
  
    const users = await dbo.users.find(
      { }, 
      { orderBy: { created: -1 }, limit: 10 }
    );
    
  }
});
```
