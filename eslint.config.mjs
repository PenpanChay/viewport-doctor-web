import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // lib/ is the plain CommonJS scanning engine and test/ + public/demo/
    // are its Vitest suite and static demo fixtures - none of these are
    // meant to satisfy the app's TypeScript-flavored lint rules
    // (require(), unused demo variables, etc).
    "lib/**",
    "test/**",
    "public/demo/**",
  ]),
]);

export default eslintConfig;
