import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { Studio } from "@/components/visualizer/Studio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Berlin B Tapes — Turn artwork + a track into a 1080p MP4" },
      {
        name: "description",
        content:
          "Berlin underground lo-fi visualizer: spinning vinyl, film grain, rain and dust over your artwork, exported as a 1920x1080 MP4 with your audio.",
      },
      {
        property: "og:title",
        content: "Berlin B Tapes — artwork + audio to 1080p MP4",
      },
      {
        property: "og:description",
        content:
          "Berlin underground lo-fi visuals rendered entirely in your browser. Nothing is uploaded.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <ClientOnly
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-xs text-muted-foreground">
          Loading studio…
        </div>
      }
    >
      <Studio />
    </ClientOnly>
  );
}
