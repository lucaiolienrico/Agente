import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    {
      name: "strip-static-pages-redirect",
      transformIndexHtml: {
        order: "pre",
        handler: (html) =>
          html.replace(
            /\s*<meta\b(?=[^>]*\bname="pages-root-redirect")[^>]*>/g,
            "",
          ),
      },
    },
  ],
  server: { host: "0.0.0.0", allowedHosts: [".e2b.app"] },
  preview: { host: "0.0.0.0", allowedHosts: [".e2b.app"] },
});
