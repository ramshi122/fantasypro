"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Sparkles, Check, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { recommendCombination, getRecommendedComboList, type ComboRecommendation } from "@/lib/combo-recommender";
import type { MatchPlayer, MatchInfo } from "@/lib/api";
import type { RoleCombo } from "@/lib/team-combos";

interface TeamCombinationSelectorProps {
  match: MatchInfo | any;
  players: MatchPlayer[];
  lineupAnnounced: boolean;
  /** Called whenever the multi-selection changes (array of selected combos) */
  onCombosChange: (combos: RoleCombo[]) => void;
  /** Compact mode (smaller cards) */
  compact?: boolean;
  /** Storage key for persistence (per-page if needed) */
  storageKey?: string;
}

/**
 * Team Combination Selector — MULTI-SELECT Swipeable Cards
 * ==========================================================
 *
 * Per user spec: "Enable MULTI-SELECTION"
 *
 * Features:
 *   - Select MULTIPLE combinations (tap to toggle)
 *   - Never remove previously selected combinations
 *   - ✓ Selected badge on each selected card
 *   - X remove button on each selected combo
 *   - Clear All / Select All Recommended buttons
 *   - Selection counter: "Selected: X Combinations"
 *   - Swipe left/right to browse combinations
 *   - AI Recommended combination highlighted with green badge
 *   - Persists selection in localStorage (survives settings changes)
 *   - Smooth animation
 *
 * The parent receives the full array of selected combos via onCombosChange.
 */

const DEFAULT_STORAGE_KEY = "apna-selected-combos";

export function TeamCombinationSelector({
  match,
  players,
  lineupAnnounced,
  onCombosChange,
  compact = false,
  storageKey = DEFAULT_STORAGE_KEY,
}: TeamCombinationSelectorProps) {
  // === AI RECOMMENDATION ===
  const recommendation = useMemo(
    () => recommendCombination(match, players, lineupAnnounced),
    [match, players, lineupAnnounced]
  );

  const comboList = useMemo(
    () => getRecommendedComboList(recommendation),
    [recommendation]
  );

  // === MULTI-SELECTION STATE ===
  const [selectedCombos, setSelectedCombos] = useState<RoleCombo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const touchStartX = useRef(0);
  const initialized = useRef(false);

  // === LOAD FROM STORAGE on mount ===
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as RoleCombo[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // CRASH FIX: validate saved combos before using them.
          // A previously-saved invalid combo (e.g. WK 0 / BAT 11 / AR 0 / BOWL 0)
          // made EVERY generated team fail role-balance validation → 0/20 teams
          // → emergency fill garbage → app appeared broken/crashed.
          // A valid combo: sums to 11, all counts ≥ 0, WK ≥ 1, BAT ≥ 2, AR ≥ 1, BOWL ≥ 2.
          const isValidCombo = (c: RoleCombo) =>
            c &&
            Number.isFinite(c.wk) && Number.isFinite(c.bat) && Number.isFinite(c.ar) && Number.isFinite(c.bowl) &&
            c.wk >= 0 && c.bat >= 0 && c.ar >= 0 && c.bowl >= 0 &&
            c.wk + c.bat + c.ar + c.bowl === 11 &&
            c.wk >= 1 && c.bat >= 2 && c.ar >= 1 && c.bowl >= 2;
          const valid = parsed.filter(isValidCombo);
          if (valid.length !== parsed.length) {
            console.warn(`[TeamCombinationSelector] Dropped ${parsed.length - valid.length} invalid saved combo(s)`);
            try {
              localStorage.setItem(storageKey, JSON.stringify(valid));
            } catch {}
          }
          if (valid.length > 0) {
            setSelectedCombos(valid);
            onCombosChange(valid);
            return;
          }
        }
      }
    } catch {}
    // Auto-select the recommended combo on first load
    if (recommendation) {
      setSelectedCombos([recommendation.combo]);
      onCombosChange([recommendation.combo]);
    }
  }, [recommendation, onCombosChange, storageKey]);

  // === PERSIST TO STORAGE whenever selection changes ===
  useEffect(() => {
    if (!initialized.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(selectedCombos));
    } catch {}
    onCombosChange(selectedCombos);
  }, [selectedCombos, onCombosChange, storageKey]);

  // === HELPERS ===
  const comboKey = (c: RoleCombo) => `${c.wk}-${c.bat}-${c.ar}-${c.bowl}`;

  function isComboSelected(c: RoleCombo): boolean {
    return selectedCombos.some(s => comboKey(s) === comboKey(c));
  }

  function toggleCombo(c: RoleCombo) {
    if (isComboSelected(c)) {
      // Deselect
      const updated = selectedCombos.filter(s => comboKey(s) !== comboKey(c));
      setSelectedCombos(updated);
    } else {
      // Select — ADD to existing (never replace)
      setSelectedCombos([...selectedCombos, c]);
    }
  }

  function removeCombo(c: RoleCombo) {
    setSelectedCombos(selectedCombos.filter(s => comboKey(s) !== comboKey(c)));
  }

  function clearAll() {
    setSelectedCombos([]);
  }

  function selectAllRecommended() {
    // Select all combos in the list
    const allCombos = comboList.map(c => c.combo);
    // Merge with existing (don't remove any)
    const existingKeys = new Set(selectedCombos.map(comboKey));
    const toAdd = allCombos.filter(c => !existingKeys.has(comboKey(c)));
    setSelectedCombos([...selectedCombos, ...toAdd]);
  }

  // === SWIPE NAVIGATION ===
  function swipeLeft() {
    setDirection(1);
    setCurrentIndex(prev => (prev + 1) % comboList.length);
  }
  function swipeRight() {
    setDirection(-1);
    setCurrentIndex(prev => (prev - 1 + comboList.length) % comboList.length);
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) swipeLeft(); else swipeRight();
    }
  }

  const currentCombo = comboList[currentIndex];
  const isSelected = currentCombo ? isComboSelected(currentCombo.combo) : false;

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
  };

  return (
    <div className={cn(
      "rounded-xl border-2 p-3",
      lineupAnnounced
        ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800"
        : "bg-violet-50/50 dark:bg-violet-950/20 border-violet-300 dark:border-violet-800"
    )}>
      {/* Header + Counter */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className={cn("w-4 h-4", lineupAnnounced ? "text-emerald-600" : "text-violet-600")} />
          <p className={cn("text-[11px] font-bold", lineupAnnounced ? "text-emerald-700 dark:text-emerald-300" : "text-violet-700 dark:text-violet-300")}>
            Team Combinations
          </p>
          <span className="text-[8px] text-muted-foreground">
            ({lineupAnnounced ? "After Lineup" : "Before Lineup"})
          </span>
        </div>
        {/* Selection counter */}
        <span className={cn(
          "text-[9px] font-black px-2 py-0.5 rounded-full",
          selectedCombos.length > 0
            ? "bg-emerald-500 text-white"
            : "bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
        )}>
          Selected: {selectedCombos.length}
        </span>
      </div>

      {/* AI reason */}
      <div className={cn(
        "rounded-lg p-1.5 mb-2 text-[8px]",
        lineupAnnounced ? "bg-emerald-100 dark:bg-emerald-950/40" : "bg-violet-100 dark:bg-violet-950/40"
      )}>
        <p className="text-muted-foreground">
          <span className="font-bold">🤖 AI:</span> {recommendation.reason}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-1 mb-2">
        <button
          onClick={selectAllRecommended}
          className="flex-1 h-6 text-[8px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
        >
          ✓ Select All
        </button>
        <button
          onClick={clearAll}
          disabled={selectedCombos.length === 0}
          className="flex-1 h-6 text-[8px] font-bold bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-40"
        >
          ✕ Clear All
        </button>
      </div>

      {/* Swipeable card */}
      <div className="relative overflow-hidden" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={cn(
              "rounded-xl border-2 p-3 cursor-pointer transition-all",
              compact ? "min-h-[60px]" : "min-h-[80px]",
              isSelected
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 ring-2 ring-emerald-400"
                : currentCombo?.isRecommended
                  ? "border-emerald-400 bg-white dark:bg-card"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-card"
            )}
            onClick={() => currentCombo && toggleCombo(currentCombo.combo)}
          >
            {/* Badges */}
            <div className="flex justify-center gap-1 mb-1">
              {currentCombo?.isRecommended && (
                <span className="text-[7px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                  {currentCombo.badge}
                </span>
              )}
              {isSelected && (
                <span className="text-[7px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  <Check className="w-2 h-2" /> SELECTED
                </span>
              )}
            </div>

            {/* Combination display */}
            {currentCombo && (
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <RoleBadge role="WK" count={currentCombo.combo.wk} color="bg-red-500" />
                <RoleBadge role="BAT" count={currentCombo.combo.bat} color="bg-blue-500" />
                <RoleBadge role="AR" count={currentCombo.combo.ar} color="bg-emerald-500" />
                <RoleBadge role="BOWL" count={currentCombo.combo.bowl} color="bg-purple-500" />
              </div>
            )}

            <div className="text-center mt-1.5">
              <span className={cn(
                "text-[8px] font-bold",
                currentCombo && currentCombo.combo.wk + currentCombo.combo.bat + currentCombo.combo.ar + currentCombo.combo.bowl === 11
                  ? "text-emerald-600" : "text-red-500"
              )}>
                Total: {currentCombo ? currentCombo.combo.wk + currentCombo.combo.bat + currentCombo.combo.ar + currentCombo.combo.bowl : 0}/11
              </span>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Arrows */}
        <button onClick={swipeRight} className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-7 h-7 rounded-full bg-white dark:bg-card border border-slate-300 dark:border-slate-700 shadow-md flex items-center justify-center hover:bg-slate-50 z-10">
          <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>
        <button onClick={swipeLeft} className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 w-7 h-7 rounded-full bg-white dark:bg-card border border-slate-300 dark:border-slate-700 shadow-md flex items-center justify-center hover:bg-slate-50 z-10">
          <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1 mt-2">
        {comboList.map((_, i) => (
          <button
            key={i}
            onClick={() => { setDirection(i > currentIndex ? 1 : -1); setCurrentIndex(i); }}
            className={cn("w-1.5 h-1.5 rounded-full transition-all", i === currentIndex ? "bg-violet-600 w-3" : "bg-slate-300")}
          />
        ))}
      </div>

      {/* Selected combos list with remove buttons */}
      {selectedCombos.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-[8px] font-bold text-slate-500">Selected Combinations:</p>
          {selectedCombos.map((c, i) => (
            <div key={i} className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-lg px-2 py-1">
              <span className="text-[8px] font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                <Check className="w-2.5 h-2.5" /> {c.wk} WK - {c.bat} BAT - {c.ar} AR - {c.bowl} BOWL
              </span>
              <button
                onClick={() => removeCombo(c)}
                className="text-red-500 hover:text-red-700 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hint */}
      {!isSelected && (
        <p className="text-center text-[7px] text-muted-foreground mt-1">
          👆 Tap card to add to selection (multi-select)
        </p>
      )}
    </div>
  );
}

function RoleBadge({ role, count, color }: { role: string; count: number; color: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-white font-black text-[10px]", color)}>
        {count}
      </div>
      <span className="text-[7px] font-bold text-muted-foreground">{role}</span>
    </div>
  );
}
