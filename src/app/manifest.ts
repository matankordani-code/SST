import type { MetadataRoute } from "next";

// "Add to home screen": opens full-screen like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SST · מערכת המרכז",
    short_name: "SST",
    description: "מערכת ניהול המרכז",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "he",
    background_color: "#F3ECDC",
    theme_color: "#2F5D73",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
