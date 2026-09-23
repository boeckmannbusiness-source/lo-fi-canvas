import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Disc3,
  Download,
  Film,
  ImageIcon,
  Badge,
  Music,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { PreviewCanvas } from "./PreviewCanvas";
import { SettingsPanel } from "./SettingsPanel";
import { analyzeBuffer, type AudioAnalysis } from "@/lib/viz/analysis";
import { isExportSupported, renderVideo } from "@/lib/viz/export";
import { loadFonts } from "@/lib/viz/fonts";
import { defaultSettings, presets, type Settings } from "@/lib/viz/types";
import {
  EXPORT_FORMATS,
  clampDuration,
  estimateSizeMb,
  exportFormatList,
  type ExportFormatId,
} from "@/lib/viz/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export function Studio() {
  const [settings, setSettings] = useState<Settings>(() =>
    presets[0]!.apply(defaultSettings()),
  );
  const [presetId, setPresetId] = useState("tokyo-night");

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageName, setImageName] = useState("");
  const imageUrlRef = useRef<string | null>(null);
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  const [logoName, setLogoName] = useState("");
  const logoUrlRef = useRef<string | null>(null);

  const [audioName, setAudioName] = useState("");
  const [duration, setDuration] = useState(0);
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [analyzing, setAnalyzing] = useState<number | null>(null);
  const [quality, setQuality] = useState(540);

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState("");
  const [exportStart, setExportStart] = useState(0);
  const [exportElapsed, setExportElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const freeClockRef = useRef(0);

  // drive the preview clock
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const el = audioElRef.current;
      if (el && audioUrlRef.current) setTime(el.currentTime);
      else if (playing) {
        freeClockRef.current += dt;
        setTime(freeClockRef.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    if (!exporting) return;
    const id = setInterval(
      () => setExportElapsed((Date.now() - exportStart) / 1000),
      500,
    );
    return () => clearInterval(id);
  }, [exporting, exportStart]);

  // cleanup
  useEffect(
    () => () => {
      audioElRef.current?.pause();
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    },
    [],
  );

  const patch = useCallback(
    <K extends keyof Settings>(key: K, value: Partial<Settings[K]>) => {
      setSettings((s) => ({ ...s, [key]: { ...s[key], ...value } }));
      setPresetId("custom");
    },
    [],
  );

  const applyPreset = (id: string) => {
    setPresetId(id);
    const p = presets.find((x) => x.id === id);
    if (p) setSettings(p.apply(defaultSettings()));
  };

  const resetSettings = () => {
    const p = presets.find((x) => x.id === presetId);
    setSettings(p ? p.apply(defaultSettings()) : defaultSettings());
  };

  const loadImage = (file: File) => {
    if (!/image\/(png|jpeg|jpg)/.test(file.type)) {
      toast.error("Please choose a PNG or JPG image.");
      return;
    }
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    const url = URL.createObjectURL(file);
    imageUrlRef.current = url;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setImageName(file.name);
    };
    img.onerror = () => toast.error("That image could not be opened.");
    img.src = url;
  };

  const loadAudio = async (file: File) => {
    if (!/audio\/(mpeg|mp3|wav|x-wav|wave)/.test(file.type) && !/\.(mp3|wav)$/i.test(file.name)) {
      toast.error("Please choose an MP3 or WAV file.");
      return;
    }
    audioElRef.current?.pause();
    setPlaying(false);
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = URL.createObjectURL(file);
    audioUrlRef.current = url;
    const el = audioElRef.current ?? new Audio();
    el.src = url;
    el.volume = muted ? 0 : volume;
    audioElRef.current = el;
    el.onended = () => setPlaying(false);
    setAudioName(file.name);

    try {
      setAnalyzing(0);
      const arrayBuf = await file.arrayBuffer();
      const ac = new AudioContext();
      const buffer = await ac.decodeAudioData(arrayBuf);
      await ac.close();
      audioBufferRef.current = buffer;
      setDuration(buffer.duration);
      const res = await analyzeBuffer(buffer, (p) => setAnalyzing(p));
      setAnalysis(res);
      setAnalyzing(null);
      toast.success(`${file.name} loaded (${fmt(buffer.duration)})`);
    } catch {
      setAnalyzing(null);
      toast.error("That audio file could not be decoded.");
    }
  };

  const loadLogo = (file: File) => {
    if (!/image\/(png|svg\+xml)/.test(file.type) && !/\.(png|svg)$/i.test(file.name)) {
      toast.error("Please choose a PNG or SVG logo.");
      return;
    }
    if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    const url = URL.createObjectURL(file);
    logoUrlRef.current = url;
    const img = new Image();
    img.onload = () => {
      setLogo(img);
      setLogoName(file.name);
      setSettings((current) => ({
        ...current,
        logo: { ...current.logo, enabled: true },
      }));
      setPresetId("custom");
    };
    img.onerror = () => toast.error("That logo could not be opened.");
    img.src = url;
  };

  const togglePlay = () => {
    const el = audioElRef.current;
    if (el && audioUrlRef.current) {
      if (playing) el.pause();
      else void el.play();
    }
    setPlaying((p) => !p);
  };

  const restart = () => {
    freeClockRef.current = 0;
    const el = audioElRef.current;
    if (el) el.currentTime = 0;
    setTime(0);
  };

  const seek = (t: number) => {
    freeClockRef.current = t;
    const el = audioElRef.current;
    if (el) el.currentTime = t;
    setTime(t);
  };

  // Load custom fonts for canvas rendering
  useEffect(() => {
    loadFonts();
  }, []);

  useEffect(() => {
    const el = audioElRef.current;
    if (el) el.volume = muted ? 0 : volume;
  }, [volume, muted]);

  const timeRef = useRef(time);
  timeRef.current = time;
  const getTimeStable = useCallback(() => timeRef.current, []);

  const exportVideo = async () => {
    if (!image) {
      toast.error("Add artwork before exporting.");
      return;
    }
    if (!isExportSupported()) {
      toast.error(
        "Your browser can't encode video. Try the latest Chrome or Edge on desktop.",
      );
      return;
    }
    audioElRef.current?.pause();
    setPlaying(false);
    const controller = new AbortController();
    abortRef.current = controller;
    setExporting(true);
    setExportProgress(0);
    setExportStage("Preparing");
    setExportStart(Date.now());
    try {
      const blob = await renderVideo({
        width: 1920,
        height: 1080,
        fps: 30,
        duration: duration || 60,
        settings,
        image,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        logo,
        logoWidth: logo?.naturalWidth ?? 0,
        logoHeight: logo?.naturalHeight ?? 0,
        analysis,
        audioBuffer: audioBufferRef.current,
        signal: controller.signal,
        onProgress: (p, stage) => {
          setExportProgress(p);
          setExportStage(stage);
        },
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(audioName || "visualizer").replace(/\.[^.]+$/, "")}-1080p.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setExportProgress(1);
      setExportStage("Done");
      toast.success("Your MP4 is ready and downloading.");
    } catch (e) {
      if ((e as Error)?.name === "AbortError") toast("Export cancelled.");
      else {
        console.error(e);
        toast.error("Export failed. Try a shorter track or reload the page.");
      }
    } finally {
      setExporting(false);
      abortRef.current = null;
    }
  };

  const estFrames = useMemo(
    () => Math.round((duration || 60) * 30),
    [duration],
  );

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4">
        <div className="flex items-center gap-2">
          <Disc3 className="size-4 text-primary" />
          <span className="text-xs font-medium uppercase tracking-[0.25em]">
            Berlin B Tapes
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden font-mono text-[10px] text-muted-foreground sm:block">
            1920×1080 · 30 fps · {estFrames} frames
          </span>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={exportVideo} disabled={exporting}>
            <Download className="size-3.5" /> Export video
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* LEFT: project */}
        <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-border/60 lg:flex">
          <div className="border-b border-border/60 px-4 py-4">
            <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Project
            </h3>
            <DropZone
              icon={<ImageIcon className="size-4" />}
              label={imageName || "Drop artwork (PNG / JPG)"}
              accept="image/png,image/jpeg"
              onFile={loadImage}
            />
            <div className="h-3" />
            <DropZone
              icon={<Badge className="size-4" />}
              label={logoName || "Drop logo (PNG / SVG)"}
              accept="image/png,image/svg+xml,.png,.svg"
              onFile={loadLogo}
            />
            <div className="h-3" />
            <DropZone
              icon={<Music className="size-4" />}
              label={audioName || "Drop audio (MP3 / WAV)"}
              accept="audio/mpeg,audio/wav,.mp3,.wav"
              onFile={(f) => void loadAudio(f)}
            />
            {analyzing !== null && (
              <div className="mt-3">
                <Progress value={analyzing * 100} className="h-1" />
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Analyzing audio… {Math.round(analyzing * 100)}%
                </p>
              </div>
            )}
            {duration > 0 && (
              <p className="mt-3 font-mono text-[10px] text-muted-foreground">
                {fmt(duration)} · everything stays on your device
              </p>
            )}
          </div>
          <div className="px-4 py-4">
            <h3 className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Presets
            </h3>
            <div className="space-y-1.5">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                    presetId === p.id
                      ? "border-primary/60 bg-primary/10"
                      : "border-border/60 hover:bg-accent/40"
                  }`}
                >
                  <div className="text-xs font-medium">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {p.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* CENTER */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center p-4 md:p-8">
            <div className="aspect-video w-full max-w-[1100px]">
              {image ? (
                <PreviewCanvas
                  settings={settings}
                  image={image}
                  logo={logo}
                  analysis={analysis}
                  getTime={getTimeStable}
                  duration={duration}
                  quality={quality}
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/60 bg-card/40">
                  <Film className="size-6 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">
                    Add artwork and a track to start the scene
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* BOTTOM transport */}
          <div className="shrink-0 border-t border-border/60 px-4 py-3">
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                variant="secondary"
                className="size-9"
                onClick={togglePlay}
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </Button>
              <Button size="icon" variant="ghost" className="size-9" onClick={restart}>
                <RotateCcw className="size-4" />
              </Button>
              <span className="w-12 font-mono text-[11px] text-muted-foreground">
                {fmt(time)}
              </span>
              <Slider
                className="flex-1"
                value={[Math.min(time, duration || 300)]}
                min={0}
                max={duration || 300}
                step={0.01}
                onValueChange={([v]) => seek(v ?? 0)}
              />
              <span className="w-12 text-right font-mono text-[11px] text-muted-foreground">
                {fmt(duration)}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="size-9"
                onClick={() => setMuted((m) => !m)}
              >
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
              </Button>
              <Slider
                className="w-24"
                value={[volume]}
                min={0}
                max={1}
                step={0.01}
                onValueChange={([v]) => {
                  setVolume(v ?? 0);
                  setMuted(false);
                }}
              />
              <Select
                value={String(quality)}
                onValueChange={(v) => setQuality(Number(v))}
              >
                <SelectTrigger className="h-8 w-[104px] text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="360" className="text-xs">
                    Preview 360p
                  </SelectItem>
                  <SelectItem value="540" className="text-xs">
                    Preview 540p
                  </SelectItem>
                  <SelectItem value="720" className="text-xs">
                    Preview 720p
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </main>

        {/* RIGHT: effects */}
        <aside className="hidden w-72 shrink-0 border-l border-border/60 xl:block">
          <SettingsPanel
            settings={settings}
            patch={patch}
            presetId={presetId}
            onPreset={applyPreset}
            onReset={resetSettings}
          />
        </aside>
      </div>

      {exporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm">
          <div className="w-[360px] rounded-xl border border-border/60 bg-card p-6 shadow-2xl">
            <h2 className="text-sm font-medium">Rendering 1920×1080 MP4</h2>
            <p className="mt-1 text-xs text-muted-foreground">{exportStage}</p>
            <Progress value={exportProgress * 100} className="mt-4 h-1.5" />
            <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>{Math.round(exportProgress * 100)}%</span>
              <span>elapsed {fmt(exportElapsed)}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-4 w-full gap-1.5 text-xs"
              onClick={() => abortRef.current?.abort()}
            >
              <X className="size-3.5" /> Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DropZone({
  icon,
  label,
  accept,
  onFile,
}: {
  icon: React.ReactNode;
  label: string;
  accept: string;
  onFile: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-3 text-[11px] transition-colors ${
        over
          ? "border-primary bg-primary/10"
          : "border-border/70 text-muted-foreground hover:bg-accent/40"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
