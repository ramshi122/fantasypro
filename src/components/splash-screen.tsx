"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { Shield, Trophy, TrendingUp } from "lucide-react";

interface SplashScreenProps {
  onFinish?: () => void;
  duration?: number; // ms
}

export function SplashScreen({ onFinish, duration = 3500 }: SplashScreenProps) {
  // CRITICAL: Don't render during SSR — only render on client.
  // This prevents hydration mismatch from Math.random / Date.now differences.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(0);

  // Only mount on client (after hydration)
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);
      if (pct >= 100) clearInterval(interval);
    }, 50);

    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onFinish?.(), 800);
    }, duration);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [duration, onFinish]);

  // Don't render during SSR — prevents hydration mismatch
  if (!mounted) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
          style={{
            background: "radial-gradient(ellipse at center top, #1a2855 0%, #0a1128 40%, #000000 100%)",
          }}
        >
          {/* Stadium light bokeh — top */}
          {/* IMPORTANT: Use deterministic values (not Math.random) to avoid
              SSR hydration mismatch. Each particle's position/size is
              calculated from its index, so server and client render identically. */}
          <div className="absolute top-0 left-0 right-0 h-1/2 overflow-hidden pointer-events-none">
            {Array.from({ length: 15 }).map((_, i) => {
              // Deterministic pseudo-random based on index
              const dRand = (seed: number) => {
                const x = Math.sin(seed * 9999 + 1) * 10000;
                return x - Math.floor(x);
              };
              const w = 4 + dRand(i * 3 + 1) * 8;
              const h = 4 + dRand(i * 3 + 2) * 8;
              const left = dRand(i * 3 + 3) * 100;
              const top = dRand(i * 3 + 4) * 100;
              const dur = 2 + dRand(i * 3 + 5) * 2;
              const delay = dRand(i * 3 + 6) * 2;
              return (
                <motion.div
                  key={`bokeh-${i}`}
                  className="absolute rounded-full bg-white"
                  style={{
                    width: `${w}px`,
                    height: `${h}px`,
                    left: `${left}%`,
                    top: `${top}%`,
                    filter: "blur(2px)",
                  }}
                  animate={{
                    opacity: [0.3, 0.9, 0.3],
                    scale: [0.8, 1.2, 0.8],
                  }}
                  transition={{
                    duration: dur,
                    repeat: Infinity,
                    delay,
                    ease: "easeInOut",
                  }}
                />
              );
            })}
          </div>

          {/* Golden light rays from top */}
          <motion.div
            className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none"
            style={{
              width: "120%",
              height: "60%",
              background: "conic-gradient(from 180deg at 50% 0%, transparent 0deg, rgba(251, 191, 36, 0.08) 10deg, transparent 20deg, rgba(251, 191, 36, 0.06) 30deg, transparent 40deg, rgba(251, 191, 36, 0.08) 50deg, transparent 60deg)",
              filter: "blur(20px)",
            }}
            animate={{ opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />

          {/* Rotating golden rings around logo */}
          <motion.div
            initial={{ scale: 0, rotate: 0, opacity: 0 }}
            animate={{ scale: 1, rotate: 360, opacity: 0.4 }}
            transition={{ duration: 3, ease: "easeOut" }}
            className="absolute w-64 h-64 rounded-full border-2 border-amber-400/30"
            style={{ boxShadow: "0 0 60px rgba(251, 191, 36, 0.15)" }}
          />
          <motion.div
            initial={{ scale: 0, rotate: 0, opacity: 0 }}
            animate={{ scale: 1.15, rotate: -360, opacity: 0.25 }}
            transition={{ duration: 3.5, ease: "easeOut", delay: 0.3 }}
            className="absolute w-72 h-72 rounded-full border border-amber-400/20"
          />

          {/* 3D-style logo with depth + glow */}
          <motion.div
            initial={{ scale: 0, rotateY: -180, opacity: 0 }}
            animate={{ scale: 1, rotateY: 0, opacity: 1 }}
            transition={{
              duration: 1.2,
              ease: "backOut",
              delay: 0.3,
            }}
            className="relative z-10"
            style={{ perspective: 1000 }}
          >
            {/* Pulsing glow behind logo */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.8, 0.4, 0.8] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute inset-0 w-44 h-44 rounded-full bg-amber-400 blur-3xl -z-10"
            />

            {/* Logo container with 3D floating effect */}
            <motion.div
              animate={{
                y: [0, -10, 0],
                rotateX: [0, 8, 0],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 1.5,
              }}
              className="w-44 h-44 rounded-3xl overflow-hidden shadow-2xl ring-4 ring-amber-400/60"
              style={{
                boxShadow: "0 20px 60px rgba(0, 0, 0, 0.6), 0 0 80px rgba(251, 191, 36, 0.5)",
              }}
            >
              <img
                src="/logo-square.png"
                alt="Apna Cricket"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                  const parent = (e.currentTarget as HTMLImageElement).parentElement;
                  if (parent) {
                    parent.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1a2855,#000000);"><span style="font-size:60px;font-weight:900;color:#fbbf24;">AC</span></div>`;
                  }
                }}
              />
            </motion.div>
          </motion.div>

          {/* App name with gold gradient */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1 }}
            className="relative z-10 mt-8 text-center"
          >
            <h1 className="text-4xl font-black tracking-tight drop-shadow-2xl">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-600">
                APNA CRICKET
              </span>
            </h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.3 }}
              className="text-xs text-white/90 mt-2 font-bold tracking-[0.4em] uppercase"
            >
              Fantasy Team
            </motion.p>
          </motion.div>

          {/* Tagline: BUILD. PLAY. WIN. */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 }}
            className="relative z-10 mt-5 text-center"
          >
            <p className="text-sm font-black tracking-[0.3em] uppercase">
              <span className="text-white">BUILD. </span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-yellow-500">PLAY</span>
              <span className="text-white">. WIN.</span>
            </p>
          </motion.div>

          {/* 3 Feature icons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.9 }}
            className="relative z-10 mt-8 flex items-center gap-6"
          >
            <FeatureIcon icon={Shield} label="TRUSTED" sublabel="PLATFORM" delay={2.0} />
            <FeatureIcon icon={Trophy} label="SMART" sublabel="PREDICTIONS" delay={2.1} />
            <FeatureIcon icon={TrendingUp} label="MAXIMIZE" sublabel="WINNINGS" delay={2.2} />
          </motion.div>

          {/* Premium loading bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.3 }}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 w-64 z-10"
          >
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] text-white/80 font-bold tracking-[0.2em]">LOADING...</p>
              <p className="text-[10px] text-amber-400 font-black tabular-nums">{Math.round(progress)}%</p>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden border border-amber-900/40">
              <motion.div
                className="h-full bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </motion.div>

          {/* Footer: POWERED BY APNA CRICKET */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.5 }}
            className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-2 z-10"
          >
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-amber-400/50" />
            <p className="text-[9px] text-white/60 font-bold tracking-[0.2em] uppercase">
              Powered by Apna Cricket
            </p>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-amber-400/50" />
          </motion.div>

          {/* Top + bottom shimmer lines */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            className="absolute top-0 w-1/2 h-0.5 bg-gradient-to-r from-transparent via-amber-400/60 to-transparent"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: "-100%" }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute bottom-0 w-1/2 h-0.5 bg-gradient-to-r from-transparent via-amber-400/40 to-transparent"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* Feature icon component */
function FeatureIcon({
  icon: Icon,
  label,
  sublabel,
  delay,
}: {
  icon: typeof Shield;
  label: string;
  sublabel: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, ease: "backOut" }}
      className="flex flex-col items-center gap-1"
    >
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400/20 to-amber-600/10 border border-amber-400/40 flex items-center justify-center">
        <Icon className="w-5 h-5 text-amber-400" />
      </div>
      <div className="text-center">
        <p className="text-[8px] text-white font-black tracking-wider">{label}</p>
        <p className="text-[7px] text-amber-400/80 font-bold tracking-wider">{sublabel}</p>
      </div>
    </motion.div>
  );
}
