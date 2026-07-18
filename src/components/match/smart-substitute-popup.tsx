"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, Sparkles, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Smart Substitute (Impact Player) Popup
 * =======================================
 *
 * Shown before team generation when a match has Substitute / Impact Player
 * possibility. Lets user choose:
 *   1. Playing XI only (Recommended) — safest, no bench/substitute players
 *   2. AI Smart Substitute — AI analyzes + may include high-confidence substitutes
 *   3. Cancel — abort generation
 *
 * Detection: Match format (T20, ODI) + lineup status + player pool size.
 * Impact Player rule is most common in T20 leagues (IPL, BBL, etc.).
 */

export type SmartSubstituteChoice = "playing-xi-only" | "ai-smart-substitute" | "cancel";

interface SmartSubstitutePopupProps {
  open: boolean;
  matchName?: string;
  matchFormat?: string;
  onChoose: (choice: SmartSubstituteChoice, dontShowAgain: boolean) => void;
}

export function SmartSubstitutePopup({
  open,
  matchName,
  matchFormat,
  onChoose,
}: SmartSubstitutePopupProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [selected, setSelected] = useState<SmartSubstituteChoice | null>(null);

  // Reset state when popup opens
  useEffect(() => {
    if (open) {
      setDontShowAgain(false);
      setSelected(null);
    }
  }, [open]);

  function handleConfirm() {
    if (selected) {
      onChoose(selected, dontShowAgain);
    }
  }

  function handleCancel() {
    onChoose("cancel", dontShowAgain);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-amber-200 dark:border-amber-900/50"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold flex items-center gap-1.5">
                    ⚡ Smart Substitute Mode
                  </h2>
                  <p className="text-[10px] text-white/80">
                    {matchName || "This match"} · {matchFormat || "T20"}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCancel}
                className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {/* Alert message */}
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3 flex items-start gap-2">
                <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-900 dark:text-amber-100 leading-relaxed">
                  ഈ മത്സരത്തിൽ <strong>Impact Player / Substitute</strong> ഉപയോഗിക്കപ്പെടാൻ സാധ്യതയുണ്ട്.
                  <br />
                  AI എങ്ങനെ ടീം ജനറേറ്റ് ചെയ്യണം?
                </p>
              </div>

              {/* Option 1: Playing XI only (Recommended) */}
              <button
                onClick={() => setSelected("playing-xi-only")}
                className={cn(
                  "w-full text-left p-3 rounded-xl border-2 transition-all",
                  selected === "playing-xi-only"
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
                    : "border-slate-200 dark:border-slate-700 hover:border-emerald-300"
                )}
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      🟢 Playing XI മാത്രം
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-bold">
                        RECOMMENDED
                      </span>
                    </p>
                    <ul className="text-[10px] text-slate-600 dark:text-slate-300 mt-1 space-y-0.5 list-disc list-inside">
                      <li>ഔദ്യോഗിക Playing XI മാത്രം ഉപയോഗിച്ച് ടീം ജനറേറ്റ് ചെയ്യുക</li>
                      <li>Bench, Offline, Reserve, Substitute കളിക്കാരെ ഉൾപ്പെടുത്തരുത്</li>
                      <li>ഏറ്റവും സുരക്ഷിതമായ മോഡ്</li>
                    </ul>
                  </div>
                </div>
              </button>

              {/* Option 2: AI Smart Substitute */}
              <button
                onClick={() => setSelected("ai-smart-substitute")}
                className={cn(
                  "w-full text-left p-3 rounded-xl border-2 transition-all",
                  selected === "ai-smart-substitute"
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
                    : "border-slate-200 dark:border-slate-700 hover:border-amber-300"
                )}
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      🟡 AI Smart Substitute
                    </p>
                    <ul className="text-[10px] text-slate-600 dark:text-slate-300 mt-1 space-y-0.5 list-disc list-inside">
                      <li>AI ലൈവ് ഡാറ്റ, ടോസ്, പിച്ച് റിപ്പോർട്ട്, ടീം കോമ്പിനേഷൻ വിശകലനം ചെയ്യുക</li>
                      <li>ഉയർന്ന സാധ്യതയുള്ള Substitute കളിക്കാരെ മാത്രം ഉൾപ്പെടുത്തുക</li>
                      <li>ഓരോ Substitute-നും Reason + Confidence (%) കാണിക്കും</li>
                    </ul>
                    <div className="mt-1.5 flex items-start gap-1 bg-amber-100/50 dark:bg-amber-900/20 rounded p-1.5">
                      <AlertTriangle className="w-3 h-3 text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-[9px] text-amber-800 dark:text-amber-200 italic">
                        AI പ്രവചനം മാത്രമാണ് — ഉറപ്പല്ല
                      </p>
                    </div>
                  </div>
                </div>
              </button>

              {/* Option 3: Cancel */}
              <button
                onClick={() => setSelected("cancel")}
                className={cn(
                  "w-full text-left p-3 rounded-xl border-2 transition-all",
                  selected === "cancel"
                    ? "border-red-500 bg-red-50 dark:bg-red-950/30"
                    : "border-slate-200 dark:border-slate-700 hover:border-red-300"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                    <X className="w-4 h-4 text-white" />
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    🔴 Cancel
                  </p>
                </div>
              </button>

              {/* Don't show again */}
              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <span className="text-[11px] text-slate-600 dark:text-slate-300">
                  ഇനി ഈ പോപ്പ്അപ്പ് കാണിക്കേണ്ട (Don&apos;t show again)
                </span>
              </label>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                className="flex-1 h-9 text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={!selected}
                className={cn(
                  "flex-1 h-9 text-xs font-bold",
                  selected === "playing-xi-only"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : selected === "ai-smart-substitute"
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : "bg-red-600 hover:bg-red-700 text-white"
                )}
              >
                {selected === "cancel" ? "Cancel Generation" : "Confirm & Generate"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Check if a match likely has Impact Player / Substitute rule.
 *
 * Detection heuristics:
 *   1. Match format is T20 (most leagues use Impact Player in T20)
 *   2. Series name contains known leagues (IPL, BBL, CPL, PSL, etc.)
 *   3. Match has substitutes field in detail
 *   4. Player pool has > 11 players per team (indicates substitutes available)
 *
 * Returns true if Impact Player is likely.
 */
export function isImpactPlayerMatch(match: any, players: any[] = []): boolean {
  if (!match) return false;

  // 1. Check format — T20 most likely
  const format = String(match.format || match.match_type || "").toLowerCase();
  const isT20 = format.includes("t20") || format.includes("t-20");

  // 2. Check series name for known leagues with Impact Player rule
  const seriesName = String(match.series || match.series_name || match.title || "").toLowerCase();
  const knownLeagues = ["ipl", "bbl", "cpl", "psl", "ilt20", "sa20", "lt20", "mlc", "bpl"];
  const isKnownLeague = knownLeagues.some((l) => seriesName.includes(l));

  // 3. Check if match detail has substitutes field
  const hasSubstitutesField = !!(match.substitutes || match.impact_players || match.impact_player);

  // 4. Check player pool size — if > 11 per team, substitutes may be available
  const playerCount = players.length;
  const hasLargePool = playerCount > 22; // 11 per team × 2 = 22 (no subs)

  // Impact Player likely if: T20 format AND (known league OR substitutes field OR large pool)
  return isT20 && (isKnownLeague || hasSubstitutesField || hasLargePool);
}

/**
 * Get user's saved preference for Smart Substitute popup.
 * Returns "playing-xi-only" | "ai-smart-substitute" | null (not set).
 */
export function getSmartSubstitutePreference(): SmartSubstituteChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const pref = localStorage.getItem("apna-smart-substitute-pref");
    if (pref === "playing-xi-only" || pref === "ai-smart-substitute") {
      return pref;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Save user's Smart Substitute preference (when "Don't show again" is checked).
 */
export function saveSmartSubstitutePreference(choice: SmartSubstituteChoice): void {
  if (typeof window === "undefined") return;
  try {
    if (choice === "playing-xi-only" || choice === "ai-smart-substitute") {
      localStorage.setItem("apna-smart-substitute-pref", choice);
    }
  } catch {
    // ignore
  }
}

/**
 * Check if popup should be shown for this match.
 * Returns false if:
 *   - User checked "Don't show again" (preference saved)
 *   - Match is NOT an Impact Player match
 */
export function shouldShowSmartSubstitutePopup(match: any, players: any[] = []): boolean {
  // Check user preference first
  const pref = getSmartSubstitutePreference();
  if (pref) {
    // User has saved preference — don't show popup, use saved choice
    return false;
  }

  // Check if match has Impact Player possibility
  return isImpactPlayerMatch(match, players);
}
