"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Star, Zap, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * My Shop Video Ad Banner
 * ========================
 *
 * Banner-style video advertisement displayed in the Research page.
 * Shows a real video ad with shop name + mobile number (87082 70548).
 *
 * Features:
 *   - Auto-playing video ad (muted, loops)
 *   - Banner overlay with shop name
 *   - Mobile number prominently displayed
 *   - Click-to-call link (tel:)
 *   - Dismissible (remembers dismissal for 24h)
 *   - Fallback animated banner if video fails to load
 */

const SHOP_MOBILE = "87082 70548";
const SHOP_MOBILE_TEL = "+918708270548";
const DISMISS_KEY = "apna-shop-ad-dismissed";
const DISMISS_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Sample video URLs — these are royalty-free product showcase videos
// In production, replace with actual shop video
const VIDEO_SOURCES = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
];

export function ShopVideoAd() {
  const [dismissed, setDismissed] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [videoIdx, setVideoIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Check if dismissed in last 24h
    try {
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_DURATION) {
        setDismissed(true);
      }
    } catch {
      // ignore
    }
  }, []);

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }

  function handleVideoError() {
    console.warn("[ShopAd] Video failed, trying next source");
    if (videoIdx < VIDEO_SOURCES.length - 1) {
      setVideoIdx(videoIdx + 1);
    } else {
      setVideoError(true);
    }
  }

  function toggleMute() {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setMuted(videoRef.current.muted);
    }
  }

  function togglePlay() {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
      setIsPlaying(!isPlaying);
    }
  }

  if (dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-2xl overflow-hidden shadow-lg border-2 border-amber-300 dark:border-amber-700"
    >
      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 z-20 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
        aria-label="Dismiss ad"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Sponsor badge */}
      <div className="absolute top-2 left-2 z-20 bg-amber-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">
        SPONSORED
      </div>

      {/* Video Ad */}
      <div className="relative aspect-video bg-gradient-to-br from-amber-600 via-orange-600 to-red-600">
        {!videoError ? (
          <video
            ref={videoRef}
            key={videoIdx}
            className="w-full h-full object-cover"
            autoPlay
            muted={muted}
            loop
            playsInline
            onError={handleVideoError}
            poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 225'%3E%3Crect fill='%23f59e0b' width='400' height='225'/%3E%3Ctext x='200' y='115' font-size='20' text-anchor='middle' fill='white' font-family='sans-serif'%3EMY SHOP%3C/text%3E%3C/svg%3E"
          >
            <source src={VIDEO_SOURCES[videoIdx]} type="video/mp4" />
          </video>
        ) : (
          // Fallback animated banner if video fails
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-600 via-orange-600 to-red-600">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-center text-white"
            >
              <div className="text-4xl mb-2">🏪</div>
              <p className="text-xl font-black">MY SHOP</p>
              <p className="text-[10px] opacity-80">Quality Products · Best Prices</p>
            </motion.div>
          </div>
        )}

        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

        {/* Video controls */}
        <div className="absolute bottom-2 right-2 z-10 flex gap-1">
          <button
            onClick={togglePlay}
            className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-[10px]"
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button
            onClick={toggleMute}
            className="w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-[10px]"
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      </div>

      {/* Banner content — Shop name + Mobile number */}
      <div className="bg-gradient-to-r from-amber-700 via-orange-700 to-red-700 p-3 text-white">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">🏪</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black flex items-center gap-1">
                MY SHOP
                <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
              </p>
              <p className="text-[10px] text-white/80 truncate">Quality Products · Best Prices</p>
            </div>
          </div>

          {/* Mobile number — Click to call */}
          <a
            href={`tel:${SHOP_MOBILE_TEL}`}
            className="flex items-center gap-1.5 bg-white text-orange-700 px-3 py-1.5 rounded-full font-black text-xs hover:bg-amber-50 transition-colors flex-shrink-0"
          >
            <Phone className="w-3.5 h-3.5" />
            <span className="tabular-nums">{SHOP_MOBILE}</span>
          </a>
        </div>

        {/* Call to action */}
        <a
          href={`tel:${SHOP_MOBILE_TEL}`}
          className="mt-2 flex items-center justify-center gap-1 bg-white/20 hover:bg-white/30 rounded-lg py-1.5 text-[10px] font-bold transition-colors"
        >
          <Zap className="w-3 h-3" />
          CALL NOW TO ORDER
          <ChevronRight className="w-3 h-3" />
        </a>
      </div>
    </motion.div>
  );
}
