import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { ReactNode } from "react";

export function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-border/60 px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </h3>
        {right}
      </div>
      <div className="space-y-3.5">{children}</div>
    </div>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-xs font-normal text-foreground/80">{label}</Label>
      {children}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row label={label}>
      <Switch checked={checked} onCheckedChange={onChange} />
    </Row>
  );
}

export function Knob({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
  format,
  disabled,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? "pointer-events-none opacity-40" : undefined}>
      <div className="mb-1.5 flex items-center justify-between">
        <Label className="text-xs font-normal text-foreground/80">{label}</Label>
        <span className="font-mono text-[10px] text-muted-foreground">
          {format ? format(value) : Math.round(value * 100) + "%"}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v ?? value)}
      />
    </div>
  );
}
