import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vitest/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The app code uses the "@/*" path alias (defined in tsconfig.json) to import
// shared lib/ modules from the API route. Vitest doesn't read tsconfig paths
// on its own, so mirror that one alias here rather than pulling in an extra
// plugin dependency just for this.
export default defineConfig({
  resolve: {
    alias: {
      "@": __dirname,
    },
  },
});
