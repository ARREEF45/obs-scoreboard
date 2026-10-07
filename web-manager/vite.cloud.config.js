import { defineConfig } from 'vite';
export default defineConfig({build:{outDir:'../portable-cloud',emptyOutDir:false,lib:{entry:'src/portable-cloud.js',name:'OBSCloud',formats:['iife'],fileName:()=> 'cloud-control.js'}}});
