"use client";

import { motion } from "framer-motion";
import { MessageCircle, Instagram, ExternalLink, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";

export function ContactScreen() {
  const setView = useApp((s) => s.setView);

  const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/HTUbZHMUIGlGwhs20HoSVR";
  const INSTAGRAM_URL = "https://www.instagram.com/thamer72450?igsh=eHluc3lhaDdrd2Rx";

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-3xl p-6 text-white shadow-lg text-center"
      >
        <Crown className="w-10 h-10 mx-auto mb-2 text-amber-300" />
        <h1 className="text-2xl font-black">Contact Us</h1>
        <p className="text-[11px] text-white/80 mt-1">
          Get in touch with Apna Cricket admin for license keys, support, and updates
        </p>
      </motion.div>

      {/* WhatsApp Group */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl p-5 text-white shadow-lg"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <MessageCircle className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-base">WhatsApp Group</h3>
            <p className="text-[10px] text-white/80">Join our VIP group for updates & tips</p>
          </div>
        </div>
        <p className="text-[11px] text-white/90 mb-3 bg-white/10 rounded-lg p-2 break-all">
          {WHATSAPP_GROUP_URL}
        </p>
        <Button
          className="w-full bg-white text-emerald-700 hover:bg-white/90 font-bold h-11"
          onClick={() => window.open(WHATSAPP_GROUP_URL, "_blank")}
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          Join WhatsApp Group
          <ExternalLink className="w-3 h-3 ml-1" />
        </Button>
      </motion.div>

      {/* Instagram */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-gradient-to-br from-pink-500 via-rose-500 to-amber-500 rounded-2xl p-5 text-white shadow-lg"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Instagram className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-base">Instagram</h3>
            <p className="text-[10px] text-white/80">Follow us @thamer72450</p>
          </div>
        </div>
        <p className="text-[11px] text-white/90 mb-3 bg-white/10 rounded-lg p-2 break-all">
          {INSTAGRAM_URL}
        </p>
        <Button
          className="w-full bg-white text-pink-700 hover:bg-white/90 font-bold h-11"
          onClick={() => window.open(INSTAGRAM_URL, "_blank")}
        >
          <Instagram className="w-4 h-4 mr-2" />
          Follow on Instagram
          <ExternalLink className="w-3 h-3 ml-1" />
        </Button>
      </motion.div>

      {/* Direct Contact Info */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-card rounded-2xl border border-violet-100 dark:border-violet-900/30 p-5"
      >
        <h3 className="font-bold text-sm text-foreground mb-3">Admin Contact</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-950/30 rounded-xl">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              <div>
                <p className="text-xs font-bold text-foreground">WhatsApp Admin</p>
                <p className="text-[10px] text-muted-foreground">For license keys & support</p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-600 text-white h-8 text-xs"
              onClick={() => window.open(WHATSAPP_GROUP_URL, "_blank")}
            >
              Chat
            </Button>
          </div>

          <div className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-950/30 rounded-xl">
            <div className="flex items-center gap-2">
              <Instagram className="w-4 h-4 text-pink-600" />
              <div>
                <p className="text-xs font-bold text-foreground">Instagram</p>
                <p className="text-[10px] text-muted-foreground">@thamer72450</p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-pink-500 hover:bg-pink-600 text-white h-8 text-xs"
              onClick={() => window.open(INSTAGRAM_URL, "_blank")}
            >
              Follow
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Support Info */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-violet-50 dark:bg-violet-950/30 rounded-2xl p-4 border border-violet-200 dark:border-violet-800"
      >
        <h3 className="font-bold text-xs text-violet-700 dark:text-violet-300 mb-2">
          What can we help with?
        </h3>
        <ul className="space-y-1.5 text-[11px] text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="text-violet-500 mt-0.5">✓</span>
            <span>License key activation issues</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-violet-500 mt-0.5">✓</span>
            <span>Team transfer problems (Dream11 / My11Circle)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-violet-500 mt-0.5">✓</span>
            <span>Elite AI feature access</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-violet-500 mt-0.5">✓</span>
            <span>Referral program questions</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-violet-500 mt-0.5">✓</span>
            <span>Purchase new license keys</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-violet-500 mt-0.5">✓</span>
            <span>Bug reports & feature requests</span>
          </li>
        </ul>
      </motion.div>

      {/* Back button */}
      <Button
        variant="outline"
        className="w-full h-11"
        onClick={() => setView("home")}
      >
        Back to Home
      </Button>
    </div>
  );
}
