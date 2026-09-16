import { defineConfig } from "vite";
export default defineConfig({
  optimizeDeps: {
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
});
