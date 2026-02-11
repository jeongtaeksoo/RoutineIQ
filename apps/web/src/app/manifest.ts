import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RoutineIQ",
    short_name: "RoutineIQ",
    description:
      "AI routine operations: analyze your Daily Flow to find peak hours, focus break triggers, and generate a smarter tomorrow schedule.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf7ef",
    theme_color: "#14b8a6",
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}

