import { useEffect, useRef } from "react";
import { frameAt, type AudioAnalysis } from "@/lib/viz/analysis";
import { renderScene } from "@/lib/viz/scene";
import type { Settings } from "@/lib/viz/types";

export function PreviewCanvas({
  settings,
  image,
  analysis,
  getTime,
  duration,
  quality,
}: {
  settings: Settings;
  image: HTMLImageElement | null;
  analysis: AudioAnalysis | null;
  getTime: () => number;
  duration: number;
  quality: number; // output height, e.g. 540
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const imageRef = useRef(image);
  imageRef.current = image;
  const analysisRef = useRef(analysis);
  analysisRef.current = analysis;
  const timeRef = useRef(getTime);
  timeRef.current = getTime;
  const durationRef = useRef(duration);
  durationRef.current = duration;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.round((quality * 16) / 9);
    canvas.height = quality;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    let raf = 0;
    const loop = () => {
      const img = imageRef.current;
      renderScene({
        ctx,
        width: canvas.width,
        height: canvas.height,
        time: timeRef.current(),
        duration: durationRef.current || 300,
        audio: frameAt(analysisRef.current, timeRef.current()),
        settings: settingsRef.current,
        image: img,
        imageWidth: img?.naturalWidth ?? 0,
        imageHeight: img?.naturalHeight ?? 0,
        scale: canvas.height / 1080,
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [quality]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full rounded-lg bg-black object-contain shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]"
    />
  );
}
