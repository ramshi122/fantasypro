"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hidden Admin Trigger Hook
 * --------------------------
 * Detects 5 taps within 3 seconds on the target element.
 * Also supports long press (3 seconds).
 *
 * Returns: { taps, registerTap, reset, longPressActive }
 */
export function useHiddenTrigger(onTrigger: () => void) {
  const tapsRef = useRef<number[]>([]);
  const [tapCount, setTapCount] = useState(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [longPressActive, setLongPressActive] = useState(false);

  function registerTap() {
    const now = Date.now();
    // Keep only taps from the last 3 seconds
    tapsRef.current = tapsRef.current.filter((t) => now - t < 3000);
    tapsRef.current.push(now);
    setTapCount(tapsRef.current.length);

    if (tapsRef.current.length >= 5) {
      onTrigger();
      tapsRef.current = [];
      setTapCount(0);
    }
  }

  function startLongPress() {
    longPressTimer.current = setTimeout(() => {
      setLongPressActive(true);
      onTrigger();
    }, 3000);
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setLongPressActive(false);
  }

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  return {
    tapCount,
    registerTap,
    startLongPress,
    cancelLongPress,
    longPressActive,
    reset: () => {
      tapsRef.current = [];
      setTapCount(0);
    },
  };
}
