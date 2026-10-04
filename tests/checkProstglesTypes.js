const { createRequire } = require("node:module");

const clientRequire = createRequire(
  require.resolve("prostgles-client", { paths: [__dirname + "/client"] }),
);
const serverVersion = require("prostgles-types/package.json").version;
const clientVersion = clientRequire("prostgles-types/package.json").version;

if (serverVersion !== clientVersion) {
  console.error(
    `prostgles-types version mismatch: server=${serverVersion}, test client=${clientVersion}. ` +
      "Shared tests require matching versions. Run npm update prostgles-types in the project root and tests/client.",
  );
  process.exit(1);
}
