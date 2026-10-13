import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // lets the frontend call "/api/..." without hardcoding localhost:5000 everywhere
      "/api": "http://localhost:5000",
    },
  },
});
