import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileJson,
  Image as ImageIcon,
  RefreshCw,
  Youtube,
  X,
} from "lucide-react";
import type { AudioAnalysis } from "@/lib/viz/analysis";
import { isExportSupported, renderVideo } from "@/lib/viz/export";
import { resolveFrameColor } from "@/lib/viz/identity";
import type { Settings } from "@/lib/viz/types";
import {
  buildDescriptionText,
  productionToLocationTag,
  resolveYouTubeMetadata,
  youtubeFilenames,
  type YouTubeProduction,
} from "@/lib/youtube/production";
import { TITLE_TEMPLATES } from "@/lib/youtube/templates";
import { YOUTUBE_EXPORT } from "@/lib/youtube/export-profile";
import {
  loadYouTubeProduction,
  persistYouTubeProduction,
} from "@/lib/youtube/persistence";
import {
  downloadBlob,
  downloadDescription,
  downloadMetadataJson,
  downloadThumbnailJpeg,
} from "@/lib/youtube/export-bundle";
import { drawThumbnail } from "@/lib/youtube/thumbnail";
import {
  runYouTubePreflight,
  type PreflightSection,
} from "@/lib/youtube/preflight";

export interface YouTubeProductionPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: Settings;
  image: HTMLImageElement | null;
  analysis: AudioAnalysis | null;
  audioBuffer: AudioBuffer | null;
  duration: number;
  audioName: string;
}

type OverrideKey = keyof YouTubeProduction["overrides"];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </h3>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PreflightView({ sections }: { sections: PreflightSection[] }) {
  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={section.id}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.checks.map((check) => (
              <li key={check.id} className="flex items-start gap-2 text-[11px]">
                <span
                  className={`mt-0.5 font-mono ${check.ok ? "text-emerald-400" : "text-destructive"}`}
                  aria-hidden
                >
                  {check.ok ? "✓" : "✗"}
                </span>
                <span className={check.ok ? "" : "text-destructive"}>
                  {check.label}
                  {check.ok && check.detail ? (
                    <span className="text-muted-foreground"> — {check.detail}</span>
                  ) : null}
                  {!check.ok && check.fix ? (
                    <span className="block text-[10px] text-muted-foreground">{check.fix}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * YouTube Production / Preflight panel.
 *
 * Configure one episode once; the same production metadata drives the title,
 * description, hashtags, tags, thumbnail text, filenames, metadata JSON, the
 * subtle opening location tag and the preflight validation. All generation is
 * deterministic and runs locally — no network, no AI, no upload.
 */
export function YouTubeProductionPanel({
  open,
  onOpenChange,
  settings,
  image,
  analysis,
  audioBuffer,
  duration,
  audioName,
}: YouTubeProductionPanelProps) {
  const [production, setProduction] = useState<YouTubeProduction>(() => loadYouTubeProduction());
  const hydrated = useRef(false);
  const thumbRef = useRef<HTMLCanvasElement>(null);

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Persist after the first render only, so booting never rewrites storage.
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    persistYouTubeProduction(production);
  }, [production]);

  const metadata = useMemo(() => resolveYouTubeMetadata(production), [production]);
  const filenames = useMemo(() => youtubeFilenames(production), [production]);
  const locationTag = useMemo(() => productionToLocationTag(production), [production]);
  const generatedDescription = useMemo(
    () => metadata.description,
    [metadata.description],
  );

  const video = useMemo(
    () => ({
      width: YOUTUBE_EXPORT.width,
      height: YOUTUBE_EXPORT.height,
      fps: YOUTUBE_EXPORT.fps,
      hasAudio: audioBuffer !== null,
      hasArtwork: image !== null,
      identityPresent: settings.frame.enabled || settings.logo.enabled,
      ctaEnabled: settings.cta.enabled,
      ctaStart: settings.cta.startTime,
    }),
    [audioBuffer, image, settings],
  );

  const preflight = useMemo(
    () =>
      runYouTubePreflight({
        production,
        metadata,
        hasThumbnail: image !== null || metadata.thumbnailTitle.length > 0,
        video,
      }),
    [production, metadata, video, image],
  );

  // Live thumbnail preview — the same draw call used for the exported JPEG.
  useEffect(() => {
    const canvas = thumbRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawThumbnail(ctx, canvas.width, canvas.height, production, {
      image: image ?? null,
      imageWidth: image ? image.naturalWidth : 0,
      imageHeight: image ? image.naturalHeight : 0,
      accent: resolveFrameColor(settings.frame),
    });
  }, [production, image, settings.frame]);

  const setField = useCallback(
    <K extends keyof YouTubeProduction>(key: K, value: YouTubeProduction[K]) => {
      setProduction((p) => ({ ...p, [key]: value }));
    },
    [],
  );

  const setOverride = useCallback((key: OverrideKey, value: string) => {
    setProduction((p) => ({ ...p, overrides: { ...p.overrides, [key]: value } }));
  }, []);

  const resetOverride = useCallback((key: OverrideKey) => {
    setProduction((p) => ({ ...p, overrides: { ...p.overrides, [key]: "" } }));
  }, []);

  const copyDescription = async () => {
    try {
      await navigator.clipboard.writeText(buildDescriptionText(metadata));
      toast.success("Description copied.");
    } catch {
      toast.error("Couldn't copy automatically — select the text to copy it.");
    }
  };

  const exportVideo = async () => {
    if (!isExportSupported()) {
      toast.error("Your browser can't encode video. Try the latest Chrome or Edge on desktop.");
      return;
    }
    if (!image) {
      toast.error("Add artwork before exporting.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setExporting(true);
    setExportProgress(0);
    setExportStage("Preparing");
    try {
      const blob = await renderVideo({
        width: YOUTUBE_EXPORT.width,
        height: YOUTUBE_EXPORT.height,
        fps: YOUTUBE_EXPORT.fps,
        duration: duration || 60,
        maxDuration: YOUTUBE_EXPORT.maxDuration,
        layout: YOUTUBE_EXPORT.layout,
        safe: YOUTUBE_EXPORT.safe,
        bitrate: YOUTUBE_EXPORT.bitrate,
        settings,
        image,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        logo: null,
        logoWidth: 0,
        logoHeight: 0,
        analysis,
        audioBuffer,
        locationTag,
        signal: controller.signal,
        onProgress: (p, stage) => {
          setExportProgress(p);
          setExportStage(stage);
        },
      });
      downloadBlob(blob, filenames.video);
      setExportProgress(1);
      setExportStage("Done");
      toast.success("YouTube MP4 ready and downloading.");
    } catch (error) {
      const err = error as Error;
      if (err?.name === "AbortError") toast("Export cancelled.");
      else {
        console.error(error);
        toast.error(err?.message || "Export failed. Try a shorter track.");
      }
    } finally {
      setExporting(false);
      abortRef.current = null;
    }
  };

  const downloadAll = async () => {
    await downloadThumbnailJpeg(production, {
      image: image ?? null,
      imageWidth: image ? image.naturalWidth : 0,
      imageHeight: image ? image.naturalHeight : 0,
      accent: resolveFrameColor(settings.frame),
    });
    downloadDescription(production, metadata);
    downloadMetadataJson(production, metadata);
    toast.success("Thumbnail, description and metadata downloading. Video stays on Export above.");
  };

  const titleLength = metadata.title.length;
  const titleOver = titleLength > 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Youtube className="size-4 text-primary" /> YouTube Production
          </DialogTitle>
          <DialogDescription className="text-xs">
            Configure the episode once, then generate its title, description, hashtags, tags,
            thumbnail, preflight and 16:9 export. All local, deterministic, and stored in this
            browser. TikTok 9:16 stays in the Export bar.
          </DialogDescription>
        </DialogHeader>

        {exporting && (
          <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
            <p className="text-xs font-medium">
              Rendering {YOUTUBE_EXPORT.width}×{YOUTUBE_EXPORT.height} @ {YOUTUBE_EXPORT.fps} fps
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{exportStage}</p>
            <Progress value={exportProgress * 100} className="mt-2 h-1.5" />
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-7 gap-1.5 text-xs"
              onClick={() => abortRef.current?.abort()}
            >
              <X className="size-3.5" /> Cancel
            </Button>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* ── Production metadata ─────────────────────────────────────── */}
          <section className="space-y-3">
            <SectionTitle>Production metadata</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Episode / Video ID">
                <Input
                  className="h-8 text-xs"
                  value={production.episode}
                  placeholder="B-005"
                  onChange={(e) => setField("episode", e.target.value)}
                />
              </Field>
              <Field label="BPM / Tempo">
                <Input
                  className="h-8 text-xs"
                  type="number"
                  min={0}
                  max={400}
                  value={production.tempo ?? ""}
                  placeholder="88"
                  onChange={(e) =>
                    setField("tempo", e.target.value === "" ? null : Number(e.target.value))
                  }
                />
              </Field>
            </div>
            <Field label="Location">
              <Input
                className="h-8 text-xs"
                value={production.location}
                placeholder="Checkpoint Charlie"
                onChange={(e) => setField("location", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Genre">
                <Input
                  className="h-8 text-xs"
                  value={production.genre}
                  placeholder="90s Boom Bap"
                  onChange={(e) => setField("genre", e.target.value)}
                />
              </Field>
              <Field label="Mood">
                <Input
                  className="h-8 text-xs"
                  value={production.mood}
                  placeholder="Late Night"
                  onChange={(e) => setField("mood", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Style">
                <Input
                  className="h-8 text-xs"
                  value={production.style}
                  placeholder="Berlin Underground"
                  onChange={(e) => setField("style", e.target.value)}
                />
              </Field>
              <Field label="Series">
                <Input
                  className="h-8 text-xs"
                  value={production.seriesName}
                  placeholder="Berlin After Dark"
                  onChange={(e) => setField("seriesName", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Concept / theme (optional)">
              <Textarea
                className="min-h-[56px] text-xs"
                value={production.concept}
                placeholder="A midnight walk from Mitte to Kreuzberg."
                onChange={(e) => setField("concept", e.target.value)}
              />
            </Field>

            <SectionTitle>Title template</SectionTitle>
            <Select
              value={production.titleTemplateId}
              onValueChange={(value) => setField("titleTemplateId", value)}
            >
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TITLE_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id} className="text-xs">
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="flex cursor-pointer items-center justify-between gap-2 pt-1 text-xs">
              <span className="flex items-center gap-2 text-muted-foreground">
                Location tag in opening seconds
              </span>
              <Switch
                checked={production.showLocationTag}
                onCheckedChange={(value) => setField("showLocationTag", value)}
              />
            </label>
          </section>

          {/* ── Preview ─────────────────────────────────────────────────── */}
          <section className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <SectionTitle>Title</SectionTitle>
                <span
                  className={`font-mono text-[10px] ${titleOver ? "text-destructive" : "text-muted-foreground"}`}
                >
                  Characters: {titleLength} / 100
                </span>
              </div>
              <Input
                className="h-8 text-xs"
                value={production.overrides.title}
                placeholder={metadata.title}
                onChange={(e) => setOverride("title", e.target.value)}
              />
              {titleOver && (
                <p className="mt-1 flex items-center gap-1 text-[10px] text-destructive">
                  <AlertTriangle className="size-3" /> Over YouTube's 100-character limit.
                </p>
              )}
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="truncate text-[10px] text-muted-foreground">
                  Preview: <span className="text-foreground">{metadata.title}</span>
                </p>
                {production.overrides.title && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 shrink-0 gap-1 px-1.5 text-[10px]"
                    onClick={() => resetOverride("title")}
                  >
                    <RefreshCw className="size-3" /> Generated
                  </Button>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <SectionTitle>Description</SectionTitle>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-1.5 text-[10px]"
                    onClick={() => void copyDescription()}
                  >
                    <Copy className="size-3" /> Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 px-1.5 text-[10px]"
                    onClick={() => downloadDescription(production, metadata)}
                  >
                    <Download className="size-3" /> .txt
                  </Button>
                  {production.overrides.description && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-1.5 text-[10px]"
                      onClick={() => resetOverride("description")}
                    >
                      <RefreshCw className="size-3" /> Generated
                    </Button>
                  )}
                </div>
              </div>
              <Textarea
                className="min-h-[180px] font-mono text-[11px]"
                value={production.overrides.description}
                placeholder={generatedDescription}
                onChange={(e) => setOverride("description", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4">
              <Field label="Hashtags" hint="Comma or space separated. Empty = generated.">
                <Input
                  className="h-8 text-xs"
                  value={production.overrides.hashtags}
                  placeholder={metadata.hashtags.join(" ")}
                  onChange={(e) => setOverride("hashtags", e.target.value)}
                />
                <div className="mt-1 flex flex-wrap gap-1">
                  {metadata.hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-accent/40 px-1.5 py-0.5 text-[10px] text-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </Field>
              <Field label="Tags" hint="One per line or comma separated. Empty = generated.">
                <Textarea
                  className="min-h-[72px] text-xs"
                  value={production.overrides.tags}
                  placeholder={metadata.tags.join("\n")}
                  onChange={(e) => setOverride("tags", e.target.value)}
                />
              </Field>
            </div>
          </section>
        </div>

        {/* ── Thumbnail ─────────────────────────────────────────────────── */}
        <section>
          <SectionTitle>Thumbnail · 1280×720</SectionTitle>
          <div className="overflow-hidden rounded-lg border border-border/60 bg-black">
            <canvas
              ref={thumbRef}
              width={1280}
              height={720}
              className="block aspect-video w-full"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 gap-1.5 text-xs"
              onClick={() =>
                void downloadThumbnailJpeg(production, {
                  image: image ?? null,
                  imageWidth: image ? image.naturalWidth : 0,
                  imageHeight: image ? image.naturalHeight : 0,
                  accent: resolveFrameColor(settings.frame),
                })
              }
            >
              <ImageIcon className="size-3.5" /> Download thumbnail JPG
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 gap-1.5 text-xs"
              onClick={() => {
                downloadDescription(production, metadata);
                downloadMetadataJson(production, metadata);
              }}
            >
              <FileJson className="size-3.5" /> Description + metadata JSON
            </Button>
          </div>
        </section>

        {/* ── Preflight ─────────────────────────────────────────────────── */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <SectionTitle>Preflight</SectionTitle>
            <span
              className={`rounded px-2 py-0.5 font-mono text-[10px] ${
                preflight.ready
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-destructive/15 text-destructive"
              }`}
            >
              {preflight.ready ? "READY FOR YOUTUBE" : `NOT READY · ${preflight.issueCount} found`}
            </span>
          </div>
          <PreflightView sections={preflight.sections} />
        </section>

        {/* ── Export ────────────────────────────────────────────────────── */}
        <section>
          <SectionTitle>Export YouTube</SectionTitle>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-3 py-2">
            <span className="font-mono text-[10px] text-muted-foreground">
              {YOUTUBE_EXPORT.width}×{YOUTUBE_EXPORT.height} · {YOUTUBE_EXPORT.fps} fps · H.264 + AAC
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {filenames.base}
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => void exportVideo()}
                disabled={exporting}
              >
                <Download className="size-3.5" /> Export 16:9 video
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 gap-1.5 text-xs"
                onClick={() => void downloadAll()}
                disabled={exporting}
              >
                <FileJson className="size-3.5" /> Download bundle files
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Bundle target: {filenames.video} · {filenames.thumbnail} · {filenames.description} ·{" "}
            {filenames.metadata}
            {audioName ? ` · audio: ${audioName}` : ""}
          </p>
          {preflight.ready ? (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-400">
              <Check className="size-3.5" /> Ready for YouTube.
            </p>
          ) : (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
              <AlertTriangle className="size-3.5" /> Resolve the preflight issues before publishing.
            </p>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}
