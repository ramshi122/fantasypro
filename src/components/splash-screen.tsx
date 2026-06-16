"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

interface SplashScreenProps {
  onFinish?: () => void;
  duration?: number; // ms
}

export function SplashScreen({ onFinish, duration = 2200 }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onFinish?.(), 600); // wait for exit animation
    }, duration);
    return () => clearTimeout(t);
  }, [duration, onFinish]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] brand-gradient flex flex-col items-center justify-center overflow-hidden"
        >
          {/* Animated decorative background shapes */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.4 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="absolute -top-32 -left-32 w-96 h-96 bg-pink-400/30 rounded-full blur-3xl"
          />
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.3 }}
            transition={{ duration: 1.4, ease: "easeOut", delay: 0.2 }}
            className="absolute -bottom-40 -right-40 w-[500px] h-[500px] bg-violet-300/30 rounded-full blur-3xl"
          />
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.2 }}
            transition={{ duration: 1.6, ease: "easeOut", delay: 0.4 }}
            className="absolute top-1/3 right-1/4 w-72 h-72 bg-fuchsia-300/30 rounded-full blur-3xl"
          />

          {/* Rotating ring around logo */}
          <motion.div
            initial={{ scale: 0, rotate: 0 }}
            animate={{ scale: 1, rotate: 360 }}
            transition={{ duration: 2, ease: "easeOut" }}
            className="absolute w-56 h-56 rounded-full border-2 border-white/20"
          />
          <motion.div
            initial={{ scale: 0, rotate: 0 }}
            animate={{ scale: 1.1, rotate: -360 }}
            transition={{ duration: 2.5, ease: "easeOut", delay: 0.2 }}
            className="absolute w-72 h-72 rounded-full border border-white/10"
          />

          {/* Big logo */}
          <motion.div
            initial={{ scale: 0, rotate: -180, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{
              duration: 0.9,
              ease: "backOut",
              delay: 0.15,
            }}
            className="relative z-10"
          >
            <div className="w-44 h-44 rounded-3xl overflow-hidden shadow-2xl shadow-violet-900/50 ring-4 ring-white/30 backdrop-blur-sm">
              <img
                src="/logo-full.png"
                alt="FantasyPro"
                className="w-full h-full object-contain"
                onError={(e) => {
                  // Fallback to square logo
                  (e.currentTarget as HTMLImageElement).src = "/logo-square.png";
                }}
              />
            </div>

            {/* Pulsing glow behind logo */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.6, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
              className="absolute inset-0 w-44 h-44 rounded-3xl bg-white blur-2xl -z-10"
            />
          </motion.div>

          {/* App name */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="relative z-10 mt-8 text-center"
          >
            <h1 className="text-5xl font-black text-white tracking-tight drop-shadow-lg">
              Fantasy
              <span className="bg-gradient-to-r from-amber-300 to-pink-300 bg-clip-text text-transparent">
                Pro
              </span>
            </h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="text-xs text-white/80 mt-2 font-medium tracking-[0.3em] uppercase"
            >
              AI Team Generator
            </motion.p>
          </motion.div>

          {/* Animated loading dots */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="absolute bottom-20 flex gap-2"
          >
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-white/80"
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.4, 1, 0.4],
                }}
                transition={{
                  duration: 1.2,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: "easeInOut",
                }}
              />
            ))}
          </motion.div>

          {/* Version footer */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="absolute bottom-8 text-[10px] text-white/50 font-medium tracking-wider"
          >
            © 2026 FantasyPro · v1.0.0
          </motion.p>

          {/* Top shimmer line */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            className="absolute top-0 w-1/2 h-1 bg-gradient-to-r from-transparent via-white/60 to-transparent"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: "-100%" }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute bottom-0 w-1/2 h-1 bg-gradient-to-r from-transparent via-white/40 to-transparent"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
