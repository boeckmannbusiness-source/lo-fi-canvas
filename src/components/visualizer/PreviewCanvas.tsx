import { useEffect, useRef } from "react";
import { frameAt, type AudioAnalysis } from "@/lib/viz/analysis";
import { renderScene } from "@/lib/viz/scene";
import { SAFE_AREAS, type ExportFormat } from "@/lib/viz/format";
import type { Settings } from "@/lib/viz/types";

export function PreviewCanvas({
  settings,
  image,
  logo,
  analysis,
  getTime,
  duration,
  quality,
  format,
  showSafeAreas = false,
}: {
  settings: Settings;
  image: HTMLImageElement | null;
  logo: HTMLImageElement | null;
  analysis: AudioAnalysis | null;
  getTime: () => number;
  duration: number;
  quality: number; // preview short-edge resolution, e.g. 540
  format: ExportFormat;
  showSafeAreas?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const imageRef = useRef(image);
  imageRef.current = image;
  const logoRef = useRef(logo);
  logoRef.current = logo;
  const analysisRef = useRef(analysis);
  analysisRef.current = analysis;
  const timeRef = useRef(getTime);
  timeRef.current = getTime;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const guidesRef = useRef(showSafeAreas);
  guidesRef.current = showSafeAreas;

  const aspect = format.width / format.height;
  const layout = format.layout;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // `quality` is the preview short edge so both formats cost the same.
    if (aspect >= 1) {
      canvas.height = quality;
      canvas.width = Math.round(quality * aspect);
    } else {
      canvas.width = quality;
      canvas.height = Math.round(quality / aspect);
    }
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const safe = SAFE_AREAS[layout];
    let raf = 0;
    const loop = () => {
      const img = imageRef.current;
      const logoImage = logoRef.current;
      renderScene({
        ctx,
        width: canvas.width,
        height: canvas.height,
        layout,
        safe,
        time: timeRef.current(),
        duration: durationRef.current || 300,
        audio: frameAt(analysisRef.current, timeRef.current()),
        settings: settingsRef.current,
        image: img,
        imageWidth: img?.naturalWidth ?? 0,
        imageHeight: img?.naturalHeight ?? 0,
        logo: logoImage,
        logoWidth: logoImage?.naturalWidth ?? 0,
        logoHeight: logoImage?.naturalHeight ?? 0,
        scale: Math.min(canvas.width, canvas.height) / 1080,
      });

      // Preview-only guides — never part of renderScene, never exported.
      if (guidesRef.current) {
        const W = canvas.width;
        const H = canvas.height;
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, 0, W, H * safe.top);
        ctx.fillRect(0, H * (1 - safe.bottom), W, H * safe.bottom);
        ctx.strokeStyle = "rgba(255,190,120,0.6)";
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 1;
        ctx.strokeRect(
          W * safe.left,
          H * safe.top,
          W * (1 - safe.left - safe.right),
          H * (1 - safe.top - safe.bottom),
        );
        ctx.restore();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [quality, aspect, layout]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full rounded-lg bg-black object-contain shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]"
    />
  );
}
