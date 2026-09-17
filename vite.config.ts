import { defineConfig } from "vite";
export default defineConfig(({ mode }) => ({
  server: { hmr: mode !== "test" },
  optimizeDeps: {
    noDiscovery: true,
    include: [
      "pdfjs-dist",
      "mammoth",
      "docx",
      "pdf-lib",
      "@pdf-lib/fontkit",
      "dompurify",
      "marked",
      "turndown",
      "papaparse",
    ],
  },
}));
