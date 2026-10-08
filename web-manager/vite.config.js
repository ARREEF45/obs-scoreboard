import { defineConfig } from "vite";
export default defineConfig({ base: "./", build:{rollupOptions:{input:{manager:'index.html',public:'public.html'}}} });
