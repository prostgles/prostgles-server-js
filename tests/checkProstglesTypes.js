const { createRequire } = require("node:module");

const clientRequire = createRequire(
  require.resolve("prostgles-client", { paths: [__dirname + "/client"] }),
);
const serverRequire = createRequire(
  require.resolve("prostgles-server", { paths: [__dirname + "/server"] }),
);
const rootVersion = require("prostgles-types/package.json").version;
const serverVersion = serverRequire("prostgles-types/package.json").version;
const clientVersion = clientRequire("prostgles-types/package.json").version;

if (rootVersion !== serverVersion || rootVersion !== clientVersion) {
  console.error(
    `prostgles-types version mismatch: root=${rootVersion}, test server=${serverVersion}, test client=${clientVersion}. ` +
      "Shared tests require matching versions. Run npm update prostgles-types in the project root, tests/server and tests/client.",
  );
  process.exit(1);
}
