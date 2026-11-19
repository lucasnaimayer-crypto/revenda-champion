import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@/": fileURLToPath(new URL("./src/", import.meta.url)),
      // Fora do Next, "server-only" não tem o que proteger.
      "server-only": fileURLToPath(new URL("./src/teste/vazio.ts", import.meta.url)),
    },
  },
});
