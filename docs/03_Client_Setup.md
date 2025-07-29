# Overview
Client-side API for interacting with a PostgreSQL database.

### Installation
To install the package, run:
```bash
npm install prostgles-client
```

### Configuration
Example react configuration and usage:
```typescript
import prostgles from "prostgles-client";
import { DBGeneratedSchema } from "./DBGeneratedSchema";

export const App = () => {

  const prgl = useProstglesClient("/ws-api");

  if(prgl.isLoading) return <div>Loading...</div>;
  return <MyComponent prgl={prgl} />;
}
```

Example configuration:
```typescript
import prostgles from "prostgles-client";
import { DBGeneratedSchema } from "./DBGeneratedSchema";
import io from "socket.io-client";
const socket = io({ path: "/ws-api" });

const prostglesClient = prostgles<DBGeneratedSchema>
  socket,
  onReady: async (dbs, methods, schema, auth) => {
    console.log(dbs.items.find());
  }
})
```

### Configuration options
<span style="color: green;">InitOptions</span>
  - **socket** <span style="color: red">required</span> <span style="color: green;">Socket&lt;DefaultEventsMap, DefaultEventsMap&gt;</span>

    Socket.io client instance
  - **onReload** <span style="color: grey">optional</span> <span style="color: green;">() =&gt; void</span>

    Execute this when requesting user reload (due to session expiring authGuard)
    Otherwise window will reload
  - **onSchemaChange** <span style="color: grey">optional</span> <span style="color: green;">() =&gt; void</span>

    Callback called when schema changes.
    "onReady" will be called after this callback
  - **onReady** <span style="color: red">required</span> <span style="color: green;">OnReadyCallback</span>

    Callback called when:
    - the client connects for the first time
    - the schema changes
    - the client reconnects
    - server requests a reload
  - **onReconnect** <span style="color: grey">optional</span> <span style="color: green;">(socket: any, error?: any) =&gt; void</span>

    Custom handler in case of websocket re-connection.
    If not provided will fire onReady
  - **onDisconnect** <span style="color: grey">optional</span> <span style="color: green;">() =&gt; void</span>

    On disconnect handler.
    It is recommended to use this callback instead of socket.on("disconnect")
  - **onDebug** <span style="color: grey">optional</span> <span style="color: green;">(event: DebugEvent) =&gt; void | Promise&lt;void&gt;</span>

    Awaited debug callback.
    Allows greater granularity during debugging.

# Client-only Methods

The following table/view methods are available on client-side only.

useSync, sync, syncOne, useSyncOne, useSubscribe, useSubscribeOne, useFind, useFindOne, useCount, useSize