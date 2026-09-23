import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Knob, Row, Section, Toggle } from "./controls";
import type { Settings } from "@/lib/viz/types";
import {
  presets,
  tapeStylePresets,
  typographyPresets,
  FONT_FAMILY_OPTIONS,
  FONT_WEIGHT_OPTIONS,
  FRAME_PRESETS,
  type FontFamily,
  type FramePreset,
} from "@/lib/viz/types";
import { RotateCcw } from "lucide-react";

type Patch = <K extends keyof Settings>(key: K, value: Partial<Settings[K]>) => void;

export function SettingsPanel({
  settings,
  patch,
  presetId,
  onPreset,
  onReset,
}: {
  settings: Settings;
  patch: Patch;
  presetId: string;
  onPreset: (id: string) => void;
  onReset: () => void;
}) {
  const sel = "h-8 w-[130px] text-xs";
  const applyFramePreset = (id: FramePreset) => {
    const preset = FRAME_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    patch("frame", id === "custom" ? { preset: id } : { preset: id, color: preset.color });
  };
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <Section
        title="Scene"
        right={
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[10px] text-muted-foreground"
            onClick={onReset}
          >
            <RotateCcw className="size-3" /> Reset
          </Button>
        }
      >
        <Row label="Preset">
          <Select value={presetId} onValueChange={onPreset}>
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {presets.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
              <SelectItem value="custom" className="text-xs">
                Custom
              </SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Artwork fit">
          <Select
            value={settings.background.fit}
            onValueChange={(v) => patch("background", { fit: v as never })}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cover" className="text-xs">
                Cover
              </SelectItem>
              <SelectItem value="contain" className="text-xs">
                Contain
              </SelectItem>
              <SelectItem value="fill" className="text-xs">
                Fill
              </SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Camera">
          <Select
            value={settings.camera.move}
            onValueChange={(v) => patch("camera", { move: v as never })}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zoom-in" className="text-xs">
                Slow zoom in
              </SelectItem>
              <SelectItem value="zoom-out" className="text-xs">
                Slow zoom out
              </SelectItem>
              <SelectItem value="none" className="text-xs">
                Locked
              </SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Knob
          label="Zoom amount / 5 min"
          value={settings.camera.amount}
          min={0}
          max={0.12}
          step={0.005}
          onChange={(v) => patch("camera", { amount: v })}
          format={(v) => `${(100 + v * 100).toFixed(1)}%`}
        />
        <Knob
          label="Horizontal drift"
          value={settings.camera.driftX}
          onChange={(v) => patch("camera", { driftX: v })}
        />
        <Knob
          label="Vertical drift"
          value={settings.camera.driftY}
          onChange={(v) => patch("camera", { driftY: v })}
        />
        <Knob
          label="Vignette"
          value={settings.background.vignette}
          onChange={(v) => patch("background", { vignette: v })}
        />
        <Knob
          label="Warmth"
          value={settings.background.warmth}
          max={0.5}
          onChange={(v) => patch("background", { warmth: v })}
        />
        <Knob
          label="Artwork vertical focus"
          value={settings.background.focusY}
          onChange={(v) => patch("background", { focusY: v })}
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </Section>

      <Section title="Vinyl">
        <Toggle
          label="Enabled"
          checked={settings.vinyl.enabled}
          onChange={(v) => patch("vinyl", { enabled: v })}
        />
        <Row label="Position">
          <Select
            value={settings.vinyl.position}
            onValueChange={(v) => patch("vinyl", { position: v as never })}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ["top-left", "Top left"],
                ["top-right", "Top right"],
                ["bottom-left", "Bottom left"],
                ["bottom-right", "Bottom right"],
                ["custom", "Custom X / Y"],
              ].map(([v, l]) => (
                <SelectItem key={v} value={v!} className="text-xs">
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        {settings.vinyl.position === "custom" && (
          <>
            <Knob
              label="X"
              value={settings.vinyl.x}
              onChange={(v) => patch("vinyl", { x: v })}
            />
            <Knob
              label="Y"
              value={settings.vinyl.y}
              onChange={(v) => patch("vinyl", { y: v })}
            />
          </>
        )}
        <Knob
          label="Size"
          value={settings.vinyl.size}
          min={0.08}
          max={0.9}
          onChange={(v) => patch("vinyl", { size: v })}
        />
        <Knob
          label="Opacity"
          value={settings.vinyl.opacity}
          onChange={(v) => patch("vinyl", { opacity: v })}
        />
        <Knob
          label="Rotation speed"
          value={settings.vinyl.rpm}
          min={5}
          max={90}
          step={0.1}
          onChange={(v) => patch("vinyl", { rpm: v })}
          format={(v) => `${v.toFixed(1)} rpm`}
        />
        <Toggle
          label="Audio-reactive scale"
          checked={settings.vinyl.audioReactive}
          onChange={(v) => patch("vinyl", { audioReactive: v })}
        />
        <Knob
          label="Label darkness"
          value={settings.vinyl.labelDarkness}
          onChange={(v) => patch("vinyl", { labelDarkness: v })}
        />
      </Section>

      <Section title="Cassette">
        <Toggle
          label="Enabled"
          checked={settings.tape.enabled}
          onChange={(v) => patch("tape", { enabled: v })}
        />
        <Row label="Style">
          <Select
            value={settings.tape.style}
            onValueChange={(v) => patch("tape", { style: v as Settings["tape"]["style"] })}
          >
            <SelectTrigger className={sel} disabled={!settings.tape.enabled}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tapeStylePresets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id} className="text-xs">
                  {preset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Position">
          <Select
            value={settings.tape.position}
            onValueChange={(v) => patch("tape", { position: v as never })}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ["top-left", "Top left"],
                ["top-right", "Top right"],
                ["bottom-left", "Bottom left"],
                ["bottom-right", "Bottom right"],
                ["center", "Center"],
                ["custom", "Custom"],
              ].map(([v, label]) => (
                <SelectItem key={v} value={v ?? "bottom-left"} className="text-xs">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Knob
          label="Horizontal position"
          value={settings.tape.x}
          disabled={!settings.tape.enabled}
          onChange={(v) => patch("tape", { position: "custom", x: v })}
        />
        <Knob
          label="Vertical position"
          value={settings.tape.y}
          disabled={!settings.tape.enabled}
          onChange={(v) => patch("tape", { position: "custom", y: v })}
        />
        <Knob
          label="Size"
          value={settings.tape.size}
          min={0.12}
          max={0.55}
          disabled={!settings.tape.enabled}
          onChange={(v) => patch("tape", { size: v })}
        />
        <Knob
          label="Opacity"
          value={settings.tape.opacity}
          disabled={!settings.tape.enabled}
          onChange={(v) => patch("tape", { opacity: v })}
        />
        <Knob
          label="Movement"
          value={settings.tape.motion}
          min={0}
          max={1}
          disabled={!settings.tape.enabled}
          onChange={(v) => patch("tape", { motion: v })}
        />
        <Toggle
          label="Audio-reactive motion"
          checked={settings.tape.audioReactive}
          onChange={(v) => patch("tape", { audioReactive: v })}
        />
        <Toggle
          label="Print artwork"
          checked={settings.tape.printArtwork}
          onChange={(v) => patch("tape", { printArtwork: v })}
        />
        <Knob
          label="Label darkness"
          value={settings.tape.labelDarkness}
          disabled={!settings.tape.enabled || !settings.tape.printArtwork}
          onChange={(v) => patch("tape", { labelDarkness: v })}
        />
      </Section>

      <Section title="Atmosphere">
        <Toggle
          label="Film grain"
          checked={settings.grain.enabled}
          onChange={(v) => patch("grain", { enabled: v })}
        />
        <Knob
          label="Grain intensity"
          value={settings.grain.intensity}
          max={0.35}
          disabled={!settings.grain.enabled}
          onChange={(v) => patch("grain", { intensity: v })}
        />
        <Toggle
          label="Dust"
          checked={settings.dust.enabled}
          onChange={(v) => patch("dust", { enabled: v })}
        />
        <Knob
          label="Dust density"
          value={settings.dust.density}
          disabled={!settings.dust.enabled}
          onChange={(v) => patch("dust", { density: v })}
        />
        <Knob
          label="Dust speed"
          value={settings.dust.speed}
          disabled={!settings.dust.enabled}
          onChange={(v) => patch("dust", { speed: v })}
        />
        <Knob
          label="Dust opacity"
          value={settings.dust.opacity}
          disabled={!settings.dust.enabled}
          onChange={(v) => patch("dust", { opacity: v })}
        />
        <Toggle
          label="Rain"
          checked={settings.rain.enabled}
          onChange={(v) => patch("rain", { enabled: v })}
        />
        <Knob
          label="Rain density"
          value={settings.rain.density}
          disabled={!settings.rain.enabled}
          onChange={(v) => patch("rain", { density: v })}
        />
        <Knob
          label="Rain speed"
          value={settings.rain.speed}
          disabled={!settings.rain.enabled}
          onChange={(v) => patch("rain", { speed: v })}
        />
        <Knob
          label="Rain opacity"
          value={settings.rain.opacity}
          max={0.6}
          disabled={!settings.rain.enabled}
          onChange={(v) => patch("rain", { opacity: v })}
        />
        <Toggle
          label="Light flicker"
          checked={settings.flicker.enabled}
          onChange={(v) => patch("flicker", { enabled: v })}
        />
        <Knob
          label="Flicker intensity"
          value={settings.flicker.intensity}
          max={0.25}
          disabled={!settings.flicker.enabled}
          onChange={(v) => patch("flicker", { intensity: v })}
        />
        <Knob
          label="Flicker speed"
          value={settings.flicker.speed}
          disabled={!settings.flicker.enabled}
          onChange={(v) => patch("flicker", { speed: v })}
        />
      </Section>

      <Section title="Audio visualizer">
        <Toggle
          label="Enabled"
          checked={settings.visualizer.enabled}
          onChange={(v) => patch("visualizer", { enabled: v })}
        />
        <Row label="Type">
          <Select
            value={settings.visualizer.type}
            onValueChange={(v) => patch("visualizer", { type: v as never })}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="waveform" className="text-xs">
                Waveform
              </SelectItem>
              <SelectItem value="spectrum" className="text-xs">
                Spectrum
              </SelectItem>
              <SelectItem value="bars" className="text-xs">
                Minimal bars
              </SelectItem>
              <SelectItem value="stereo" className="text-xs">
                Stereo levels
              </SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Orientation">
          <Select
            value={settings.visualizer.orientation}
            onValueChange={(v) => patch("visualizer", { orientation: v as never })}
            disabled={settings.visualizer.type !== "stereo"}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vertical" className="text-xs">
                Vertical
              </SelectItem>
              <SelectItem value="horizontal" className="text-xs">
                Horizontal
              </SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Position">
          <Select
            value={settings.visualizer.position}
            onValueChange={(v) => patch("visualizer", { position: v as never })}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bottom-center" className="text-xs">
                Bottom center
              </SelectItem>
              <SelectItem value="bottom-left" className="text-xs">
                Bottom left
              </SelectItem>
              <SelectItem value="bottom-right" className="text-xs">
                Bottom right
              </SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Knob
          label="Opacity"
          value={settings.visualizer.opacity}
          disabled={!settings.visualizer.enabled}
          onChange={(v) => patch("visualizer", { opacity: v })}
        />
        <Knob
          label="Size"
          value={settings.visualizer.size}
          disabled={!settings.visualizer.enabled}
          onChange={(v) => patch("visualizer", { size: v })}
        />
        <Knob
          label="Sensitivity"
          value={settings.visualizer.sensitivity}
          min={0.2}
          max={3}
          step={0.05}
          disabled={!settings.visualizer.enabled}
          onChange={(v) => patch("visualizer", { sensitivity: v })}
          format={(v) => `${v.toFixed(2)}x`}
        />
      </Section>

      {/* ── Typography ──────────────────────────────────────────────────── */}
      <Section title="Typography">
        <Toggle
          label="Enabled"
          checked={settings.text.enabled}
          onChange={(v) => patch("text", { enabled: v })}
        />

        {/* Text content */}
        <Input
          value={settings.text.title}
          placeholder="Title"
          className="h-8 text-xs"
          disabled={!settings.text.enabled}
          onChange={(e) => patch("text", { title: e.target.value })}
        />
        <Toggle
          label="Show subtitle"
          checked={settings.text.showSubtitle}
          onChange={(v) => patch("text", { showSubtitle: v })}
        />
        <Input
          value={settings.text.subtitle}
          placeholder="Subtitle"
          className="h-8 text-xs"
          disabled={!settings.text.enabled || !settings.text.showSubtitle}
          onChange={(e) => patch("text", { subtitle: e.target.value })}
        />

        {/* Font family */}
        <Row label="Font family">
          <Select
            value={settings.text.fontFamily}
            onValueChange={(v) => patch("text", { fontFamily: v as FontFamily })}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILY_OPTIONS.map((f) => (
                <SelectItem key={f.value} value={f.value} className="text-xs">
                  {f.label}
                  <span className="ml-1.5 text-[10px] text-muted-foreground">
                    {f.category}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        {/* Font weights */}
        <Row label="Title weight">
          <Select
            value={String(settings.text.titleWeight)}
            onValueChange={(v) => patch("text", { titleWeight: Number(v) })}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHT_OPTIONS.map((w) => (
                <SelectItem key={w.value} value={String(w.value)} className="text-xs">
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Subtitle weight">
          <Select
            value={String(settings.text.subtitleWeight)}
            onValueChange={(v) => patch("text", { subtitleWeight: Number(v) })}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHT_OPTIONS.map((w) => (
                <SelectItem key={w.value} value={String(w.value)} className="text-xs">
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>

        {/* Font sizes */}
        <Knob
          label="Title size"
          value={settings.text.fontSize}
          min={1}
          max={20}
          step={0.1}
          disabled={!settings.text.enabled}
          onChange={(v) => patch("text", { fontSize: v })}
          format={(v) => `${v.toFixed(1)}%`}
        />
        <Knob
          label="Subtitle size"
          value={settings.text.subtitleSize}
          min={0.5}
          max={8}
          step={0.1}
          disabled={!settings.text.enabled || !settings.text.showSubtitle}
          onChange={(v) => patch("text", { subtitleSize: v })}
          format={(v) => `${v.toFixed(1)}%`}
        />

        {/* Letter spacing */}
        <Knob
          label="Title tracking"
          value={settings.text.titleLetterSpacing}
          min={-0.05}
          max={0.2}
          step={0.005}
          disabled={!settings.text.enabled}
          onChange={(v) => patch("text", { titleLetterSpacing: v })}
          format={(v) => v === 0 ? "0" : v > 0 ? `+${(v * 100).toFixed(1)}%` : `${(v * 100).toFixed(1)}%`}
        />
        <Knob
          label="Subtitle tracking"
          value={settings.text.subtitleLetterSpacing}
          min={-0.02}
          max={0.2}
          step={0.005}
          disabled={!settings.text.enabled || !settings.text.showSubtitle}
          onChange={(v) => patch("text", { subtitleLetterSpacing: v })}
          format={(v) => v === 0 ? "0" : v > 0 ? `+${(v * 100).toFixed(1)}%` : `${(v * 100).toFixed(1)}%`}
        />

        {/* Line height */}
        <Knob
          label="Line height"
          value={settings.text.lineHeight}
          min={0.8}
          max={2.5}
          step={0.05}
          disabled={!settings.text.enabled}
          onChange={(v) => patch("text", { lineHeight: v })}
          format={(v) => `${v.toFixed(2)}x`}
        />

        {/* Colors */}
        <HexColorInput
          label="Title color"
          value={settings.text.titleColor}
          onChange={(color) => patch("text", { titleColor: color })}
        />
        <Knob
          label="Title opacity"
          value={settings.text.titleOpacity}
          disabled={!settings.text.enabled}
          onChange={(v) => patch("text", { titleOpacity: v })}
        />
        <HexColorInput
          label="Subtitle color"
          value={settings.text.subtitleColor}
          onChange={(color) => patch("text", { subtitleColor: color })}
        />
        <Knob
          label="Subtitle opacity"
          value={settings.text.subtitleOpacity}
          disabled={!settings.text.enabled || !settings.text.showSubtitle}
          onChange={(v) => patch("text", { subtitleOpacity: v })}
        />

        {/* Positioning */}
        <Row label="Horizontal">
          <Select
            value={settings.text.positionH}
            onValueChange={(v) => patch("text", { positionH: v as never })}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left" className="text-xs">
                Left
              </SelectItem>
              <SelectItem value="center" className="text-xs">
                Center
              </SelectItem>
              <SelectItem value="right" className="text-xs">
                Right
              </SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Vertical">
          <Select
            value={settings.text.positionV}
            onValueChange={(v) => patch("text", { positionV: v as never })}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="top" className="text-xs">
                Top
              </SelectItem>
              <SelectItem value="center" className="text-xs">
                Center
              </SelectItem>
              <SelectItem value="bottom" className="text-xs">
                Bottom
              </SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Preset position">
          <Select
            value={settings.text.position}
            onValueChange={(v) => patch("text", { position: v as never })}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ["center", "Center"],
                ["top-left", "Top left"],
                ["top-center", "Top center"],
                ["top-right", "Top right"],
                ["bottom-left", "Bottom left"],
                ["bottom-center", "Bottom center"],
                ["bottom-right", "Bottom right"],
                ["custom", "Custom"],
              ].map(([v, l]) => (
                <SelectItem key={v} value={v!} className="text-xs">
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        {settings.text.position === "custom" && (
          <>
            <Knob
              label="Custom X"
              value={settings.text.customX}
              disabled={!settings.text.enabled}
              onChange={(v) => patch("text", { customX: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <Knob
              label="Custom Y"
              value={settings.text.customY}
              disabled={!settings.text.enabled}
              onChange={(v) => patch("text", { customY: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </>
        )}

        {/* Text alignment */}
        <Row label="Text align">
          <Select
            value={settings.text.textAlignment}
            onValueChange={(v) => patch("text", { textAlignment: v as never })}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left" className="text-xs">
                Left
              </SelectItem>
              <SelectItem value="center" className="text-xs">
                Center
              </SelectItem>
              <SelectItem value="right" className="text-xs">
                Right
              </SelectItem>
            </SelectContent>
          </Select>
        </Row>

        {/* Shadow */}
        <Toggle
          label="Shadow"
          checked={settings.text.shadowEnabled}
          onChange={(v) => patch("text", { shadowEnabled: v })}
        />
        {settings.text.shadowEnabled && (
          <>
            <HexColorInput
              label="Shadow color"
              value={settings.text.shadowColor}
              onChange={(color) => patch("text", { shadowColor: color })}
            />
            <Knob
              label="Shadow opacity"
              value={settings.text.shadowOpacity}
              disabled={!settings.text.enabled}
              onChange={(v) => patch("text", { shadowOpacity: v })}
            />
            <Knob
              label="Shadow blur"
              value={settings.text.shadowBlur}
              min={0}
              max={1}
              step={0.01}
              disabled={!settings.text.enabled}
              onChange={(v) => patch("text", { shadowBlur: v })}
              format={(v) => `${(v * 100).toFixed(0)}%`}
            />
            <Knob
              label="Shadow offset X"
              value={settings.text.shadowOffsetX}
              min={-0.5}
              max={0.5}
              step={0.01}
              disabled={!settings.text.enabled}
              onChange={(v) => patch("text", { shadowOffsetX: v })}
              format={(v) => `${(v * 100).toFixed(0)}%`}
            />
            <Knob
              label="Shadow offset Y"
              value={settings.text.shadowOffsetY}
              min={-0.5}
              max={0.5}
              step={0.01}
              disabled={!settings.text.enabled}
              onChange={(v) => patch("text", { shadowOffsetY: v })}
              format={(v) => `${(v * 100).toFixed(0)}%`}
            />
          </>
        )}

        {/* Stroke */}
        <Toggle
          label="Stroke / outline"
          checked={settings.text.strokeEnabled}
          onChange={(v) => patch("text", { strokeEnabled: v })}
        />
        {settings.text.strokeEnabled && (
          <>
            <HexColorInput
              label="Stroke color"
              value={settings.text.strokeColor}
              onChange={(color) => patch("text", { strokeColor: color })}
            />
            <Knob
              label="Stroke width"
              value={settings.text.strokeWidth}
              min={0}
              max={0.3}
              step={0.005}
              disabled={!settings.text.enabled}
              onChange={(v) => patch("text", { strokeWidth: v })}
              format={(v) => `${(v * 100).toFixed(1)}%`}
            />
          </>
        )}

        {/* Typography presets */}
        <div className="pt-1">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
            Typography Presets
          </p>
          <div className="space-y-1.5">
            {typographyPresets.map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  patch("text", p.apply(settings).text)
                }
                className="w-full rounded-md border border-border/60 px-3 py-2 text-left transition-colors hover:bg-accent/40"
              >
                <div className="text-xs font-medium">{p.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {p.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Logo overlay">
        <Toggle
          label="Enabled"
          checked={settings.logo.enabled}
          onChange={(v) => patch("logo", { enabled: v })}
        />
        <Row label="Position">
          <Select
            value={settings.logo.position}
            onValueChange={(v) => patch("logo", { position: v as never })}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ["top-left", "Top left"],
                ["top-right", "Top right"],
                ["bottom-left", "Bottom left"],
                ["bottom-right", "Bottom right"],
              ].map(([v, label]) => (
                <SelectItem key={v} value={v ?? "top-right"} className="text-xs">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Knob
          label="Size"
          value={settings.logo.size}
          min={0.04}
          max={0.35}
          onChange={(v) => patch("logo", { size: v })}
        />
        <Knob
          label="Opacity"
          value={settings.logo.opacity}
          onChange={(v) => patch("logo", { opacity: v })}
        />
        <Knob
          label="Edge margin"
          value={settings.logo.margin}
          min={0.01}
          max={0.12}
          onChange={(v) => patch("logo", { margin: v })}
        />
      </Section>

      {/* ── Video identity ──────────────────────────────────────────────── */}

      <Section title="Video identity · Frame">
        <Toggle
          label="Enabled"
          checked={settings.frame.enabled}
          onChange={(v) => patch("frame", { enabled: v })}
        />
        <Row label="Preset">
          <Select
            value={settings.frame.preset}
            onValueChange={(v) => applyFramePreset(v as FramePreset)}
          >
            <SelectTrigger className={sel} disabled={!settings.frame.enabled}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FRAME_PRESETS.map((preset) => (
                <SelectItem key={preset.id} value={preset.id} className="text-xs">
                  {preset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <HexColorInput
          label="Color"
          value={settings.frame.color}
          onChange={(color) => patch("frame", { color, preset: "custom" })}
        />
        <Knob
          label="Thickness"
          value={settings.frame.thickness}
          min={0.005}
          max={0.1}
          step={0.001}
          disabled={!settings.frame.enabled}
          onChange={(v) => patch("frame", { thickness: v })}
          format={(v) => `${Math.round(v * 1080)}px`}
        />
        <Knob
          label="Opacity"
          value={settings.frame.opacity}
          disabled={!settings.frame.enabled}
          onChange={(v) => patch("frame", { opacity: v })}
        />
        <Knob
          label="Inner shadow"
          value={settings.frame.shadow}
          disabled={!settings.frame.enabled}
          onChange={(v) => patch("frame", { shadow: v })}
        />
        <Knob
          label="Analog texture"
          value={settings.frame.texture}
          disabled={!settings.frame.enabled}
          onChange={(v) => patch("frame", { texture: v })}
        />
      </Section>

      <Section title="Video identity · Now playing">
        <Toggle
          label="Enabled"
          checked={settings.nowPlaying.enabled}
          onChange={(v) => patch("nowPlaying", { enabled: v })}
        />
        <Input
          value={settings.nowPlaying.label}
          placeholder="NOW PLAYING"
          className="h-8 text-xs"
          disabled={!settings.nowPlaying.enabled}
          onChange={(e) => patch("nowPlaying", { label: e.target.value })}
        />
        <Toggle
          label="Show label"
          checked={settings.nowPlaying.showLabel}
          onChange={(v) => patch("nowPlaying", { showLabel: v })}
        />
        <Input
          value={settings.nowPlaying.title}
          placeholder="Track title"
          className="h-8 text-xs"
          disabled={!settings.nowPlaying.enabled}
          onChange={(e) => patch("nowPlaying", { title: e.target.value })}
        />
        <Toggle
          label="Show title"
          checked={settings.nowPlaying.showTitle}
          onChange={(v) => patch("nowPlaying", { showTitle: v })}
        />
        <Input
          value={settings.nowPlaying.artist}
          placeholder="Artist"
          className="h-8 text-xs"
          disabled={!settings.nowPlaying.enabled}
          onChange={(e) => patch("nowPlaying", { artist: e.target.value })}
        />
        <Toggle
          label="Show artist"
          checked={settings.nowPlaying.showArtist}
          onChange={(v) => patch("nowPlaying", { showArtist: v })}
        />
        <Toggle
          label="Show rule"
          checked={settings.nowPlaying.showRule}
          onChange={(v) => patch("nowPlaying", { showRule: v })}
        />
        <Row label="Position">
          <Select
            value={settings.nowPlaying.position}
            onValueChange={(v) => patch("nowPlaying", { position: v as never })}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ["top-right", "Top right"],
                ["top-left", "Top left"],
                ["bottom-right", "Bottom right"],
                ["bottom-left", "Bottom left"],
                ["custom", "Custom X / Y"],
              ].map(([v, label]) => (
                <SelectItem key={v} value={v ?? "top-right"} className="text-xs">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        {settings.nowPlaying.position === "custom" && (
          <>
            <Knob
              label="Custom X"
              value={settings.nowPlaying.customX}
              disabled={!settings.nowPlaying.enabled}
              onChange={(v) => patch("nowPlaying", { customX: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <Knob
              label="Custom Y"
              value={settings.nowPlaying.customY}
              disabled={!settings.nowPlaying.enabled}
              onChange={(v) => patch("nowPlaying", { customY: v })}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </>
        )}
        <Row label="Align">
          <Select
            value={settings.nowPlaying.align}
            onValueChange={(v) => patch("nowPlaying", { align: v as never })}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left" className="text-xs">
                Left
              </SelectItem>
              <SelectItem value="center" className="text-xs">
                Center
              </SelectItem>
              <SelectItem value="right" className="text-xs">
                Right
              </SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Knob
          label="Size"
          value={settings.nowPlaying.size}
          min={1}
          max={8}
          step={0.1}
          disabled={!settings.nowPlaying.enabled}
          onChange={(v) => patch("nowPlaying", { size: v })}
          format={(v) => `${v.toFixed(1)}%`}
        />
        <Row label="Font family">
          <Select
            value={settings.nowPlaying.fontFamily}
            onValueChange={(v) => patch("nowPlaying", { fontFamily: v as FontFamily })}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILY_OPTIONS.map((f) => (
                <SelectItem key={f.value} value={f.value} className="text-xs">
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Weight">
          <Select
            value={String(settings.nowPlaying.weight)}
            onValueChange={(v) => patch("nowPlaying", { weight: Number(v) })}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHT_OPTIONS.map((w) => (
                <SelectItem key={w.value} value={String(w.value)} className="text-xs">
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Knob
          label="Tracking"
          value={settings.nowPlaying.letterSpacing}
          min={0}
          max={0.3}
          step={0.005}
          disabled={!settings.nowPlaying.enabled}
          onChange={(v) => patch("nowPlaying", { letterSpacing: v })}
          format={(v) => `+${(v * 100).toFixed(1)}%`}
        />
        <HexColorInput
          label="Color"
          value={settings.nowPlaying.color}
          onChange={(color) => patch("nowPlaying", { color })}
        />
        <Knob
          label="Opacity"
          value={settings.nowPlaying.opacity}
          disabled={!settings.nowPlaying.enabled}
          onChange={(v) => patch("nowPlaying", { opacity: v })}
        />
      </Section>

      <Section title="Video identity · Call to action">
        <Toggle
          label="Enabled"
          checked={settings.cta.enabled}
          onChange={(v) => patch("cta", { enabled: v })}
        />
        <Knob
          label="Start time"
          value={settings.cta.startTime}
          min={0}
          max={600}
          step={1}
          disabled={!settings.cta.enabled}
          onChange={(v) => patch("cta", { startTime: v })}
          format={(v) => fmtSeconds(v)}
        />
        <Knob
          label="Duration"
          value={settings.cta.duration}
          min={2}
          max={10}
          step={0.5}
          disabled={!settings.cta.enabled}
          onChange={(v) => patch("cta", { duration: v })}
          format={(v) => `${v.toFixed(1)}s`}
        />
        <Input
          value={settings.cta.text}
          placeholder="LIKE & SUBSCRIBE"
          className="h-8 text-xs"
          disabled={!settings.cta.enabled}
          onChange={(e) => patch("cta", { text: e.target.value })}
        />
        <Toggle
          label="Show secondary line"
          checked={settings.cta.showSubText}
          onChange={(v) => patch("cta", { showSubText: v })}
        />
        <Input
          value={settings.cta.subText}
          placeholder="BERLIN B TAPES"
          className="h-8 text-xs"
          disabled={!settings.cta.enabled || !settings.cta.showSubText}
          onChange={(e) => patch("cta", { subText: e.target.value })}
        />
        <Row label="Animation">
          <Select
            value={settings.cta.animationStyle}
            onValueChange={(v) => patch("cta", { animationStyle: v as never })}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="slide-fade" className="text-xs">
                Slide &amp; fade
              </SelectItem>
              <SelectItem value="fade" className="text-xs">
                Fade
              </SelectItem>
              <SelectItem value="scale" className="text-xs">
                Scale
              </SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Row label="Background">
          <Select
            value={settings.cta.backgroundStyle}
            onValueChange={(v) => patch("cta", { backgroundStyle: v as never })}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="title-card" className="text-xs">
                Title card
              </SelectItem>
              <SelectItem value="dim" className="text-xs">
                Dimmed artwork
              </SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <Toggle
          label="Use frame color"
          checked={settings.cta.useFrameColor}
          onChange={(v) => patch("cta", { useFrameColor: v })}
        />
        {!settings.cta.useFrameColor && (
          <HexColorInput
            label="Accent color"
            value={settings.cta.color}
            onChange={(color) => patch("cta", { color })}
          />
        )}
        <Row label="Font family">
          <Select
            value={settings.cta.fontFamily}
            onValueChange={(v) => patch("cta", { fontFamily: v as FontFamily })}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILY_OPTIONS.map((f) => (
                <SelectItem key={f.value} value={f.value} className="text-xs">
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row label="Weight">
          <Select
            value={String(settings.cta.weight)}
            onValueChange={(v) => patch("cta", { weight: Number(v) })}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHT_OPTIONS.map((w) => (
                <SelectItem key={w.value} value={String(w.value)} className="text-xs">
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Knob
          label="Tracking"
          value={settings.cta.letterSpacing}
          min={0}
          max={0.3}
          step={0.005}
          disabled={!settings.cta.enabled}
          onChange={(v) => patch("cta", { letterSpacing: v })}
          format={(v) => `+${(v * 100).toFixed(1)}%`}
        />
        <Knob
          label="Opacity"
          value={settings.cta.opacity}
          disabled={!settings.cta.enabled}
          onChange={(v) => patch("cta", { opacity: v })}
        />
      </Section>

      <div className="h-10" />
    </div>
  );
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function fmtSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

function HexColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <Row label={label}>
      <div className="flex w-[130px] items-center gap-2">
        <Input
          type="color"
          aria-label={`${label} picker`}
          value={value}
          className="h-8 w-9 cursor-pointer p-1"
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        <Input
          aria-label={`${label} hex`}
          value={draft}
          maxLength={7}
          className="h-8 min-w-0 font-mono text-xs uppercase"
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            if (HEX_COLOR.test(next)) onChange(next.toUpperCase());
          }}
          onBlur={() => setDraft(HEX_COLOR.test(draft) ? draft.toUpperCase() : value)}
        />
      </div>
    </Row>
  );
}
