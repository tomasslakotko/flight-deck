import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "airBaltic Crew",
    short_name: "BT Crew",
    description: "Roster, live flight status, and passenger lists for airBaltic crew.",
    start_url: "/",
    display: "standalone",
    background_color: "#F0F4F8",
    theme_color: "#00A3E0",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
