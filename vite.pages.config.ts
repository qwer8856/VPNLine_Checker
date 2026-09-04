import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/VPNLine_Checker/",
  plugins: [react()],
  build: {
    emptyOutDir: true,
    outDir: "pages-dist",
  },
});
