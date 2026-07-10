"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Copy,
  ClipboardPaste,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { TeamRow } from "@/lib/api";
import {
  copyTeamsToClipboard,
  pasteTeamsFromClipboard,
  type PasteResult,
} from "@/lib/team-clipboard";

interface CopyPasteModalProps {
  open: boolean;
  onClose: () => void;
  teams: TeamRow[];
  onPaste: (teams: TeamRow[]) => void;
}

export function CopyPasteModal({ open, onClose, teams, onPaste }: CopyPasteModalProps) {
  const [copying, setCopying] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasteResult, setPasteResult] = useState<PasteResult | null>(null);

  async function handleCopy() {
    setCopying(true);
    const result = await copyTeamsToClipboard(teams);
    setCopying(false);
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  }

  async function handlePaste() {
    setPasting(true);
    const result = await pasteTeamsFromClipboard();
    setPasting(false);
    setPasteResult(result);
    if (result.success && result.teams.length > 0) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  }

  function handleImportPasted() {
    if (pasteResult?.success && pasteResult.teams.length > 0) {
      onPaste(pasteResult.teams);
      onClose();
      toast.success(`Imported ${pasteResult.teams.length} teams`);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="bg-background w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-gradient-to-r from-violet-700 to-purple-700 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                  <Copy className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black">Bulk Copy / Paste Teams</h2>
                  <p className="text-[10px] text-white/80">
                    {teams.length} teams ready to copy
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/20">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* Copy section */}
              <div className="rounded-xl p-3 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800">
                <p className="text-xs font-bold text-violet-700 dark:text-violet-300 mb-2 flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5" />
                  Copy All Teams
                </p>
                <p className="text-[10px] text-muted-foreground mb-3">
                  Copies all {teams.length} teams to clipboard. You can paste them into another match
                  or share with friends.
                </p>
                <Button
                  className="w-full h-10 bg-violet-600 hover:bg-violet-700 text-white font-bold"
                  onClick={handleCopy}
                  disabled={copying || teams.length === 0}
                >
                  {copying ? (
                    <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Copying...</>
                  ) : (
                    <><Copy className="w-4 h-4 mr-1.5" /> Copy {teams.length} Teams</>
                  )}
                </Button>
              </div>

              {/* Paste section */}
              <div className="rounded-xl p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-2 flex items-center gap-1.5">
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  Paste Teams
                </p>
                <p className="text-[10px] text-muted-foreground mb-3">
                  Reads teams from clipboard. Pasted teams will REPLACE your current teams.
                </p>
                <Button
                  className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  onClick={handlePaste}
                  disabled={pasting}
                >
                  {pasting ? (
                    <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Reading clipboard...</>
                  ) : (
                    <><ClipboardPaste className="w-4 h-4 mr-1.5" /> Paste from Clipboard</>
                  )}
                </Button>

                {/* Paste result */}
                {pasteResult && (
                  <div className="mt-3 space-y-2">
                    <div className={`rounded-lg p-2 text-[11px] ${
                      pasteResult.success
                        ? "bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300"
                        : "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300"
                    }`}>
                      <div className="flex items-center gap-1.5 font-bold">
                        {pasteResult.success ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5" />
                        )}
                        {pasteResult.message}
                      </div>
                      {pasteResult.errors.length > 0 && (
                        <ul className="mt-1 ml-5 list-disc text-[10px] opacity-80">
                          {pasteResult.errors.slice(0, 5).map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                          {pasteResult.errors.length > 5 && (
                            <li>...and {pasteResult.errors.length - 5} more</li>
                          )}
                        </ul>
                      )}
                    </div>

                    {pasteResult.success && pasteResult.teams.length > 0 && (
                      <Button
                        className="w-full h-10 bg-amber-600 hover:bg-amber-700 text-white font-bold"
                        onClick={handleImportPasted}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1.5" />
                        Import {pasteResult.teams.length} Teams (Replace Current)
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="rounded-lg p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <p className="text-[10px] text-amber-700 dark:text-amber-300">
                  💡 Copy-paste works between matches and devices. Teams are stored in JSON format
                  with full player data (name, role, credits, captain, VC).
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
