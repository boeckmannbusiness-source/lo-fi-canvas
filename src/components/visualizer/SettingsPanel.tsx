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
import { presets } from "@/lib/viz/types";
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
                ["custom", "Custom"],
              ].map(([v, l]) => (
                <SelectItem key={v} value={v} className="text-xs">
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

      <Section title="Text overlay">
        <Toggle
          label="Enabled"
          checked={settings.text.enabled}
          onChange={(v) => patch("text", { enabled: v })}
        />
        <Input
          value={settings.text.title}
          placeholder="Title"
          className="h-8 text-xs"
          onChange={(e) => patch("text", { title: e.target.value })}
        />
        <Input
          value={settings.text.subtitle}
          placeholder="Subtitle"
          className="h-8 text-xs"
          onChange={(e) => patch("text", { subtitle: e.target.value })}
        />
        <Row label="Position">
          <Select
            value={settings.text.position}
            onValueChange={(v) => patch("text", { position: v as never })}
          >
            <SelectTrigger className={sel}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                ["top-left", "Top left"],
                ["top-center", "Top center"],
                ["center", "Center"],
                ["bottom-left", "Bottom left"],
              ].map(([v, l]) => (
                <SelectItem key={v} value={v} className="text-xs">
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Knob
          label="Font size"
          value={settings.text.fontSize}
          disabled={!settings.text.enabled}
          onChange={(v) => patch("text", { fontSize: v })}
        />
        <Knob
          label="Opacity"
          value={settings.text.opacity}
          disabled={!settings.text.enabled}
          onChange={(v) => patch("text", { opacity: v })}
        />
      </Section>
      <div className="h-10" />
    </div>
  );
}
