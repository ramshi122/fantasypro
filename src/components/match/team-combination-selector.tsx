"use client";

import { useState, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { recommendCombination, getRecommendedComboList, type ComboRecommendation } from "@/lib/combo-recommender";
import type { MatchPlayer, MatchInfo } from "@/lib/api";
import type { RoleCombo } from "@/lib/team-combos";

interface TeamCombinationSelectorProps {
  match: MatchInfo | any;
  players: MatchPlayer[];
  lineupAnnounced: boolean;
  /** Called when user selects a combination */
  onComboSelect: (combo: RoleCombo) => void;
  /** Currently selected combo (controlled) */
  selectedCombo?: RoleCombo | null;
  /** Compact mode (smaller cards) */
  compact?: boolean;
}

/**
 * Team Combination Selector — Swipeable Cards
 * ============================================
 *
 * Per user spec: "Horizontal Swipe Combination Selector"
 *
 * Features:
 *   - Swipe left/right to choose team combinations
 *   - Show only VALID 11-player combinations
 *   - Highlight AI Recommended combination with green "Recommended" badge
 *   - One-tap selection
 *   - Smooth animation
 *   - Remember the selected combination during team generation
 *
 * Used in ALL team generation sections (Elite AI, Smart AI, Classic, etc.)
 */
export function TeamCombinationSelector({
  match,
  players,
  lineupAnnounced,
  onComboSelect,
  selectedCombo,
  compact = false,
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

  // === STATE ===
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const touchStartX = useRef(0);

  // Auto-select the recommended combo on mount
  useMemo(() => {
    if (!selectedCombo && recommendation) {
      onComboSelect(recommendation.combo);
    }
  }, [recommendation, selectedCombo, onComboSelect]);

  function swipeLeft() {
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % comboList.length);
  }

  function swipeRight() {
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + comboList.length) % comboList.length);
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) swipeLeft();
      else swipeRight();
    }
  }

  const currentCombo = comboList[currentIndex];
  const isSelected = selectedCombo &&
    selectedCombo.wk === currentCombo.combo.wk &&
    selectedCombo.bat === currentCombo.combo.bat &&
    selectedCombo.ar === currentCombo.combo.ar &&
    selectedCombo.bowl === currentCombo.combo.bowl;

  function handleSelect() {
    onComboSelect(currentCombo.combo);
  }

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -300 : 300,
      opacity: 0,
    }),
  };

  return (
    <div className={cn(
      "rounded-xl border-2 p-3",
      lineupAnnounced
        ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800"
        : "bg-violet-50/50 dark:bg-violet-950/20 border-violet-300 dark:border-violet-800"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className={cn("w-4 h-4", lineupAnnounced ? "text-emerald-600" : "text-violet-600")} />
          <p className={cn("text-[11px] font-bold", lineupAnnounced ? "text-emerald-700 dark:text-emerald-300" : "text-violet-700 dark:text-violet-300")}>
            Team Combination Selector
          </p>
          <span className="text-[8px] text-muted-foreground">
            ({lineupAnnounced ? "After Lineup" : "Before Lineup"})
          </span>
        </div>
        <span className="text-[8px] font-bold text-muted-foreground">
          {currentIndex + 1}/{comboList.length}
        </span>
      </div>

      {/* AI Recommendation reason */}
      <div className={cn(
        "rounded-lg p-1.5 mb-2 text-[8px]",
        lineupAnnounced ? "bg-emerald-100 dark:bg-emerald-950/40" : "bg-violet-100 dark:bg-violet-950/40"
      )}>
        <p className="text-muted-foreground">
          <span className="font-bold">🤖 AI:</span> {recommendation.reason}
        </p>
        <p className="text-muted-foreground mt-0.5">
          <span className="font-bold">Confidence:</span> {recommendation.confidence}% · <span className="font-bold">Pitch:</span> {recommendation.pitchType}
        </p>
      </div>

      {/* Swipeable card area */}
      <div
        className="relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
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
                : currentCombo.isRecommended
                  ? "border-emerald-400 bg-white dark:bg-card"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-card"
            )}
            onClick={handleSelect}
          >
            {/* Recommended badge */}
            {currentCombo.isRecommended && (
              <div className="flex justify-center mb-1">
                <span className="text-[7px] font-bold bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                  {currentCombo.badge}
                </span>
              </div>
            )}

            {/* Selected indicator */}
            {isSelected && (
              <div className="flex justify-center mb-1">
                <span className="text-[7px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  <Check className="w-2 h-2" /> SELECTED
                </span>
              </div>
            )}

            {/* Combination display */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <RoleBadge role="WK" count={currentCombo.combo.wk} color="bg-red-500" />
              <RoleBadge role="BAT" count={currentCombo.combo.bat} color="bg-blue-500" />
              <RoleBadge role="AR" count={currentCombo.combo.ar} color="bg-emerald-500" />
              <RoleBadge role="BOWL" count={currentCombo.combo.bowl} color="bg-purple-500" />
            </div>

            {/* Total */}
            <div className="text-center mt-1.5">
              <span className={cn(
                "text-[8px] font-bold",
                currentCombo.combo.wk + currentCombo.combo.bat + currentCombo.combo.ar + currentCombo.combo.bowl === 11
                  ? "text-emerald-600"
                  : "text-red-500"
              )}>
                Total: {currentCombo.combo.wk + currentCombo.combo.bat + currentCombo.combo.ar + currentCombo.combo.bowl}/11
              </span>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Left/Right arrows */}
        <button
          onClick={swipeRight}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-7 h-7 rounded-full bg-white dark:bg-card border border-slate-300 dark:border-slate-700 shadow-md flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 z-10"
          aria-label="Previous combination"
        >
          <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>
        <button
          onClick={swipeLeft}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 w-7 h-7 rounded-full bg-white dark:bg-card border border-slate-300 dark:border-slate-700 shadow-md flex items-center justify-center hover:bg-slate-50 dark:hover:bg-slate-800 z-10"
          aria-label="Next combination"
        >
          <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1 mt-2">
        {comboList.map((_, i) => (
          <button
            key={i}
            onClick={() => {
              setDirection(i > currentIndex ? 1 : -1);
              setCurrentIndex(i);
            }}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-all",
              i === currentIndex
                ? "bg-violet-600 dark:bg-violet-400 w-3"
                : "bg-slate-300 dark:bg-slate-700"
            )}
            aria-label={`Combination ${i + 1}`}
          />
        ))}
      </div>

      {/* Tap to select hint */}
      {!isSelected && (
        <p className="text-center text-[7px] text-muted-foreground mt-1">
          👆 Tap card to select this combination
        </p>
      )}
    </div>
  );
}

/** Role badge component */
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
