import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({plugins:[react()],server:{port:Number(process.env.VITE_DEV_PORT??5173),proxy:{"/api":{target:process.env.VITE_API_PROXY_TARGET??"http://localhost:3000",changeOrigin:true}}},test:{environment:"jsdom",setupFiles:"./src/test/setup.ts"}});
