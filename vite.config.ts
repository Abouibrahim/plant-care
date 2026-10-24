import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "prompt": a new version never reloads the page on its own (a reload mid-capture would lose
      // the photo); Layout shows a small "Reload" banner instead.
      registerType: "prompt",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png"],
      manifest: {
        name: "Plant Care",
        short_name: "Plant Care",
        description: "Identify plants and keep their care calendar for the backyard and the farm.",
        theme_color: "#2e7046",
        background_color: "#f6f2e8",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Never serve index.html for API calls, and never cache them.
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        // The push and notification-click handlers (public/push-sw.js) join the generated worker
        // through importScripts, so the worker stays generated and no second build is needed.
        importScripts: ["push-sw.js"],
        globIgnores: ["push-sw.js"],
      },
    }),
  ],
  server: { port: 5173 },
});
