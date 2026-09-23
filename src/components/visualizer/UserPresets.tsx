import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  capturePresetSettings,
  deletePreset,
  isPresetStorageAvailable,
  loadPresets,
  savePreset,
  type PresetSettings,
  type StoredPreset,
} from "@/lib/presets";
import type { Settings } from "@/lib/viz/types";
import type { ExportFormatId } from "@/lib/viz/format";

function formatSavedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved";
  try {
    return `Saved ${new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(date)}`;
  } catch {
    return "Saved";
  }
}

/**
 * "Save as preset" + the user's saved presets list.
 *
 * Deliberately isolated from the renderer: it only captures settings, hands
 * them back through `onApply`, and persists to localStorage. Loading a preset
 * re-runs the normal state update, so the preview refreshes on its own.
 */
export function UserPresets({
  settings,
  formatId,
  portraitDuration,
  onApply,
}: {
  settings: Settings;
  formatId: ExportFormatId;
  portraitDuration: number;
  onApply: (settings: PresetSettings) => void;
}) {
  const [presets, setPresets] = useState<StoredPreset[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<StoredPreset | null>(null);

  const storageAvailable = useMemo(() => isPresetStorageAvailable(), []);

  useEffect(() => {
    setPresets(loadPresets());
  }, []);

  const trimmedName = name.trim();
  const canSave = trimmedName.length > 0 && storageAvailable;

  const handleSave = useCallback(() => {
    if (trimmedName.length === 0) return;
    const captured = capturePresetSettings(settings, formatId, portraitDuration);
    const result = savePreset(trimmedName, captured);
    if (!result) {
      toast.error("Could not save the preset in this browser.");
      return;
    }
    setPresets(result.presets);
    setSaveOpen(false);
    setName("");
    toast.success(`Preset “${result.preset.name}” saved.`);
  }, [trimmedName, settings, formatId, portraitDuration]);

  const handleLoad = useCallback(
    (preset: StoredPreset) => {
      onApply(preset.settings);
      toast.success(`Loaded “${preset.name}”.`);
    },
    [onApply],
  );

  const handleDelete = useCallback(() => {
    if (!pendingDelete) return;
    const next = deletePreset(pendingDelete.id);
    if (next === null) {
      toast.error("Could not update saved presets in this browser.");
    } else {
      setPresets(next);
    }
    setPendingDelete(null);
  }, [pendingDelete]);

  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        size="sm"
        className="w-full justify-start gap-2 text-xs"
        onClick={() => setSaveOpen(true)}
        disabled={!storageAvailable}
      >
        <Save className="size-3.5" />
        Save as preset
      </Button>

      {!storageAvailable && (
        <p className="text-[10px] text-muted-foreground">
          Browser storage is unavailable, so presets can’t be saved here.
        </p>
      )}

      {presets.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">
          No saved presets yet. Save your current look to reuse it later.
        </p>
      ) : (
        <div className="space-y-1.5">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="flex items-center gap-1 rounded-md border border-border/60 transition-colors hover:bg-accent/40"
            >
              <button
                type="button"
                onClick={() => handleLoad(preset)}
                className="min-w-0 flex-1 px-3 py-2 text-left"
                title={`Load ${preset.name}`}
              >
                <div className="truncate text-xs font-medium">{preset.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {formatSavedAt(preset.updatedAt)}
                </div>
              </button>
              <button
                type="button"
                aria-label={`Delete ${preset.name}`}
                onClick={() => setPendingDelete(preset)}
                className="mr-1 rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={saveOpen}
        onOpenChange={(open) => {
          setSaveOpen(open);
          if (!open) setName("");
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Save as preset</DialogTitle>
            <DialogDescription className="text-xs">
              Name this look. It is stored only in this browser.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            maxLength={80}
            placeholder="Blacktop – Red Frame"
            className="h-8 text-xs"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) {
                e.preventDefault();
                handleSave();
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => {
                setSaveOpen(false);
                setName("");
              }}
            >
              Cancel
            </Button>
            <Button size="sm" className="text-xs" disabled={!canSave} onClick={handleSave}>
              Save preset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Delete preset?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {pendingDelete
                ? `“${pendingDelete.name}” will be removed. Your current settings stay as they are.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-8 bg-destructive text-xs text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
