import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Check, Download, Loader2, Upload, Video, WandSparkles, X } from "lucide-react";
import {
  analyzeVideoFile,
  convertVideoToTikTok,
  isConverterSupported,
  type AnalyzeResult,
} from "@/lib/viz/convert";
import { audioCodecLabel, videoCodecLabel } from "@/lib/viz/compat";
import { pickMobileUpload } from "@/lib/send-to-mobile";
import { SendToMobile } from "./SendToMobile";

const fmtBytes = (n: number) => {
  if (!Number.isFinite(n) || n <= 0) return "0 MB";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const fmtDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const VIDEO_FILE = /^video\//i;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|ogv|avi)$/i;

const isVideoFile = (file: File) => VIDEO_FILE.test(file.type) || VIDEO_EXT.test(file.name);

interface ConvertedOutput {
  blob: Blob;
  filename: string;
  size: number;
  warning: string | null;
  scaled: boolean;
  width: number;
  height: number;
}

/**
 * Self-contained "Existing Video → TikTok Compatible Conversion" dialog.
 *
 * It never touches the visualizer state: the user picks an existing file, sees
 * whether it is already compatible, converts it through the source-frame
 * pipeline, and downloads the result.
 */
export function TikTokConverter() {
  const support = useMemo(() => isConverterSupported(), []);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState<ConvertedOutput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setFile(null);
    setAnalysis(null);
    setResult(null);
    setError(null);
    setProgress(0);
    setStage("");
    setAnalyzing(false);
    setConverting(false);
  };

  const pickFile = async (next: File) => {
    if (!isVideoFile(next)) {
      toast.error("Please choose a video file (MP4, MOV, WebM…).");
      return;
    }
    abortRef.current?.abort();
    setFile(next);
    setAnalysis(null);
    setResult(null);
    setError(null);
    setProgress(0);
    setStage("");
    setAnalyzing(true);
    try {
      setAnalysis(await analyzeVideoFile(next));
    } catch (cause) {
      console.error(cause);
      setError("That video could not be read. Try a standard MP4 or WebM file.");
    } finally {
      setAnalyzing(false);
    }
  };

  const convert = async () => {
    if (!file || !analysis) return;
    if (!support.supported) {
      toast.error(support.reason ?? "Conversion is not supported in this browser.");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setConverting(true);
    setError(null);
    setResult(null);
    setProgress(0);
    setStage("Preparing");
    try {
      const output = await convertVideoToTikTok(file, {
        signal: controller.signal,
        onProgress: (value, nextStage) => {
          setProgress(value);
          setStage(nextStage);
        },
      });
      setResult({
        blob: output.blob,
        filename: output.filename,
        size: output.blob.size,
        warning: output.audioWarning,
        scaled: output.scaled,
        width: output.width,
        height: output.height,
      });
      if (output.audioWarning) toast.error(output.audioWarning);
      else toast.success("TikTok-compatible MP4 ready.");
    } catch (cause) {
      const err = cause as Error;
      if (err?.name === "AbortError") {
        toast("Conversion cancelled.");
      } else {
        console.error(cause);
        setError(err?.message || "Conversion failed.");
      }
    } finally {
      setConverting(false);
      abortRef.current = null;
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const report = analysis?.report ?? null;
  const alreadyCompatible = report?.compatible ?? false;
  // The mobile flow reuses the existing Cloudinary upload: it sends the
  // converted MP4 when present, otherwise the already-compatible original.
  const mobileSource = pickMobileUpload({
    converted: result,
    original: file,
    alreadyCompatible,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && converting) abortRef.current?.abort();
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          title="Convert an existing video into a TikTok-compatible MP4"
        >
          <WandSparkles className="size-3.5" />
          Convert video
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-base">Make an existing video TikTok-compatible</DialogTitle>
          <DialogDescription className="text-xs">
            Re-encodes an existing MP4/WebM into the same target as the visualizer export (H.264 +
            AAC-LC 48 kHz, MP4, fast start) — without rendering the visualizer.
          </DialogDescription>
        </DialogHeader>

        {!support.supported && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {support.reason}
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="video/*,.mp4,.m4v,.mov,.webm,.mkv,.ogv"
          className="hidden"
          onChange={(event) => {
            const next = event.target.files?.[0];
            if (next) void pickFile(next);
            event.target.value = "";
          }}
        />

        {!file && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={converting}
            className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border/70 px-4 py-8 text-xs text-muted-foreground transition-colors hover:bg-accent/40 disabled:opacity-50"
          >
            <Upload className="size-4" />
            Choose an existing video (MP4 / MOV / WebM)
          </button>
        )}

        {file && (
          <div className="space-y-3">
            <div className="rounded-md border border-border/60 px-3 py-2">
              <div className="flex items-center gap-2">
                <Video className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-xs font-medium">{file.name}</span>
              </div>
              <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                {analysis
                  ? `${analysis.width || "?"}×${analysis.height || "?"} · ${analysis.fps} fps · ${fmtDuration(analysis.durationSeconds)}`
                  : "Analyzing…"}{" "}
                · {fmtBytes(file.size)}
              </div>
              {analysis && (
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {videoCodecLabel(analysis.info.video?.codec)} video
                  {analysis.hasAudio
                    ? ` · ${audioCodecLabel(analysis.info.audio?.codec)} audio${
                        analysis.audioSampleRate
                          ? ` · ${Math.round(analysis.audioSampleRate / 100) / 10} kHz`
                          : ""
                      }${analysis.audioChannels ? ` · ${analysis.audioChannels} ch` : ""}`
                    : " · no audio"}
                </div>
              )}
            </div>

            {analyzing && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Analyzing container and codecs…
              </div>
            )}

            {analysis && alreadyCompatible && !result && (
              <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
                <div className="flex items-center gap-2 font-medium">
                  <Check className="size-3.5 text-primary" /> Already TikTok-compatible
                </div>
                <p className="mt-1 text-muted-foreground">
                  No conversion is needed. Download the original file unchanged.
                </p>
              </div>
            )}

            {analysis && !alreadyCompatible && !result && (
              <div className="rounded-md border border-border/60 px-3 py-2 text-xs">
                <div className="font-medium">{report?.summary}</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {report?.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
                {report?.videoNote && (
                  <p className="mt-1 text-[10px] text-muted-foreground">{report.videoNote}</p>
                )}
              </div>
            )}

            {converting && (
              <div>
                <Progress value={progress * 100} className="h-1.5" />
                <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground">
                  <span>{stage || "Converting…"}</span>
                  <span>{Math.round(progress * 100)}%</span>
                </div>
              </div>
            )}

            {result && (
              <div className="rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <Check className="size-3.5 text-primary" /> TikTok-compatible MP4 ready
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                  {result.filename} · {fmtBytes(result.size)} · {result.width}×{result.height}
                  {result.scaled ? " (scaled)" : ""}
                </div>
                {result.warning && (
                  <p className="mt-1 text-[10px] text-destructive">{result.warning}</p>
                )}
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex flex-wrap items-center gap-2">
              {result ? (
                <>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => downloadBlob(result.blob, result.filename)}
                  >
                    <Download className="size-3.5" /> Download
                  </Button>
                  {mobileSource && (
                    <SendToMobile
                      blob={mobileSource.blob}
                      filename={mobileSource.filename}
                      label="Send to Mobile"
                      uploadingLabel="Uploading to mobile…"
                      retryLabel="Retry"
                      buttonClassName="h-8"
                    />
                  )}
                  <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={reset}>
                    Convert another
                  </Button>
                </>
              ) : alreadyCompatible ? (
                <>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => file && downloadBlob(file, file.name)}
                  >
                    <Download className="size-3.5" /> Download original
                  </Button>
                  {mobileSource && (
                    <SendToMobile
                      blob={mobileSource.blob}
                      filename={mobileSource.filename}
                      label="Send to Mobile"
                      uploadingLabel="Uploading to mobile…"
                      retryLabel="Retry"
                      buttonClassName="h-8"
                    />
                  )}
                </>
              ) : (
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => void convert()}
                  disabled={!analysis || analyzing || converting || !support.supported}
                >
                  {converting ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" /> Converting…
                    </>
                  ) : (
                    <>
                      <WandSparkles className="size-3.5" /> Convert for TikTok
                    </>
                  )}
                </Button>
              )}
              {converting && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => abortRef.current?.abort()}
                >
                  <X className="size-3.5" /> Cancel
                </Button>
              )}
              {!result && !converting && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => inputRef.current?.click()}
                >
                  Choose different file
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
