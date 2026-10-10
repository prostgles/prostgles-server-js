import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

export const checkGeneratedTypes = (schema: string, checks: string) => {
  const configPath = ts.findConfigFile(__dirname, (filename) => ts.sys.fileExists(filename));
  assert(configPath, "Missing test tsconfig.json");
  const config = ts.getParsedCommandLineOfConfigFile(configPath, { noEmit: true }, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      assert.fail(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
    },
  });
  assert(config);
  const directory = path.join(path.dirname(configPath), "debug");
  mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, `generated-types-${randomUUID()}.ts`);
  writeFileSync(filename, schema + checks);
  const program = ts.createProgram([filename], config.options);
  const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)];
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    }),
  );
};
