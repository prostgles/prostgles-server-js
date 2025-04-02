import pluginSecurity from "eslint-plugin-security";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules", "dist", "examples", "**/*.d.ts", "tests", "docs"],
  },
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  pluginSecurity.configs.recommended,
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.js", "*.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.js", "**/*.ts"],
    extends: [
      // "eslint:recommended",
      // "plugin:@typescript-eslint/recommended",
      tseslint.configs.recommendedTypeChecked,
      // tsEslint.configs.recommended,
      // pluginSecurity.configs.recommended,
    ],
    rules: {
      "no-cond-assign": "error",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/ban-types": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-async-promise-executor": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "no-unused-vars": "off",
      "no-empty": "off",
      "security/detect-object-injection": "off",
      "@typescript-eslint/only-throw-error": "off",
      "@typescript-eslint/restrict-template-expressions": "warn",
      "@typescript-eslint/no-misused-promises": ["warn", { checksVoidReturn: false }],
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/await-thenable": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/prefer-promise-reject-errors": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  }
);
// module.exports = {
//   languageOptions: {
//     ecmaVersion: "latest",
//     sourceType: "module",
//     project: "./tsconfig.json",
//     allowImportExportEverywhere: true,
//     parser: "@typescript-eslint/parser",
//   },
//   plugins: { "@typescript-eslint": tsEslint },
//   extends: [
//     // "eslint:recommended",
//     // "plugin:@typescript-eslint/recommended",
//     js.configs.recommended,
//     // tsEslint.configs.recommended,
//     // pluginSecurity.configs.recommended,
//   ],
//   rules: {
//     "no-cond-assign": "error",
//     "@typescript-eslint/no-namespace": "off",
//     "@typescript-eslint/no-explicit-any": "off",
//     "@typescript-eslint/no-non-null-assertion": "off",
//     "@typescript-eslint/ban-types": "off",
//     "@typescript-eslint/ban-ts-comment": "off",
//     "@typescript-eslint/no-unused-expressions": "off",
//     "@typescript-eslint/no-require-imports": "off",
//     "@typescript-eslint/no-empty-object-type": "off",
//     "no-async-promise-executor": "off",
//     "@typescript-eslint/no-var-requires": "off",
//     "@typescript-eslint/no-unnecessary-condition": "error",
//     "@typescript-eslint/no-floating-promises": "error",
//     "no-unused-vars": "off",
//     "no-empty": "off",
//     "@typescript-eslint/no-unused-vars": [
//       "warn",
//       {
//         argsIgnorePattern: "^_",
//         varsIgnorePattern: "^_",
//         caughtErrorsIgnorePattern: "^_",
//       },
//     ],
//   },
//   ignores: ["node_modules", "dist", "examples", "**/*.d.ts", "tests", "docs"],
// };
