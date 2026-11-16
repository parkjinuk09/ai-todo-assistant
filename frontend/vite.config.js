import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // 맥 로컬 설치용 빌드: 서비스 워커가 옛 화면을 캐시에서 먼저 보여 주므로 끈다.
      // selfDestroying은 이미 등록된 워커와 캐시까지 지운다.
      selfDestroying: process.env.LOCAL_APP === "1",
      includeAssets: ["favicon.png"],
      manifest: {
        name: "할 일",
        short_name: "할 일",
        description: "로컬 모델 비서가 붙은 개인 할 일 목록",
        start_url: "/",
        display: "standalone",
        background_color: "#e4e4e8",
        theme_color: "#e4e4e8",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: { navigateFallbackDenylist: [/^\/api/] },
    }),
  ],
});
