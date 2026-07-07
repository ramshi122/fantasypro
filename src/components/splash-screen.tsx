"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface SplashScreenProps {
  onFinish?: () => void;
  duration?: number; // ms
}

export function SplashScreen({ onFinish, duration = 3000 }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(0);

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

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
          style={{
            background: "radial-gradient(ellipse at center, #1e1b4b 0%, #0f0f23 50%, #000000 100%)",
          }}
        >
          {/* Animated star field background */}
          <div className="absolute inset-0">
            {Array.from({ length: 40 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 bg-white rounded-full"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0, 1.5, 0],
                }}
                transition={{
                  duration: 2 + Math.random() * 3,
                  repeat: Infinity,
                  delay: Math.random() * 3,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>

          {/* Golden rotating rings around logo */}
          <motion.div
            initial={{ scale: 0, rotate: 0, opacity: 0 }}
            animate={{ scale: 1, rotate: 360, opacity: 0.6 }}
            transition={{ duration: 2.5, ease: "easeOut" }}
            className="absolute w-72 h-72 rounded-full border-2 border-amber-400/30"
            style={{ boxShadow: "0 0 60px rgba(251, 191, 36, 0.2)" }}
          />
          <motion.div
            initial={{ scale: 0, rotate: 0, opacity: 0 }}
            animate={{ scale: 1.15, rotate: -360, opacity: 0.4 }}
            transition={{ duration: 3, ease: "easeOut", delay: 0.3 }}
            className="absolute w-80 h-80 rounded-full border border-amber-400/20"
          />
          <motion.div
            initial={{ scale: 0, rotate: 0, opacity: 0 }}
            animate={{ scale: 1.3, rotate: 360, opacity: 0.2 }}
            transition={{ duration: 3.5, ease: "easeOut", delay: 0.6 }}
            className="absolute w-96 h-96 rounded-full border border-amber-400/10"
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
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute inset-0 w-48 h-48 rounded-full bg-amber-400 blur-3xl -z-10"
            />

            {/* Logo container with 3D effect */}
            <motion.div
              animate={{
                y: [0, -8, 0],
                rotateX: [0, 5, 0],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 1.5,
              }}
              className="w-48 h-48 rounded-3xl overflow-hidden shadow-2xl ring-4 ring-amber-400/50"
              style={{
                boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5), 0 0 80px rgba(251, 191, 36, 0.4)",
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
                    parent.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1e1b4b,#0f0f23);"><span style="font-size:64px;font-weight:900;color:#fbbf24;">AC</span></div>`;
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
            className="relative z-10 mt-10 text-center"
          >
            <h1 className="text-5xl font-black tracking-tight drop-shadow-2xl">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-600">
                APNA
              </span>{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-700">
                CRICKET
              </span>
            </h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.3 }}
              className="text-xs text-amber-300/80 mt-3 font-bold tracking-[0.4em] uppercase"
            >
              ⭐ Fantasy Team ⭐
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              className="text-[10px] text-slate-400 mt-2 font-medium tracking-[0.2em] uppercase"
            >
              Pick • Strategize • Win
            </motion.p>
          </motion.div>

          {/* Premium loading bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.8 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 w-64"
          >
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden border border-amber-900/30">
              <motion.div
                className="h-full bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-center text-[10px] text-amber-400/60 mt-2 font-bold tracking-wider">
              LOADING • {Math.round(progress)}%
            </p>
          </motion.div>

          {/* Footer */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2 }}
            className="absolute bottom-8 text-[10px] text-slate-500 font-medium tracking-wider"
          >
            © 2026 Apna Cricket · Premium v1.0.0
          </motion.p>

          {/* Top + bottom shimmer lines */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            className="absolute top-0 w-1/2 h-0.5 bg-gradient-to-r from-transparent via-amber-400/60 to-transparent"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: "-100%" }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute bottom-0 w-1/2 h-0.5 bg-gradient-to-r from-transparent via-amber-400/40 to-transparent"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
