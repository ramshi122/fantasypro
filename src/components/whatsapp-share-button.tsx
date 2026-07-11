"use client";

/**
 * WhatsApp Share Button
 * =====================
 * A small button that generates a WhatsApp-friendly team summary and opens
 * wa.me in a new tab.
 *
 * Additive — does NOT modify any existing share button.
 */

import { useState } from "react";
import { MessageCircle, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  generateTeamText,
  generateWhatsAppLink,
  type GenerateTeamTextOpts,
} from "@/lib/whatsapp-share";
import type { TeamRow } from "@/lib/api";
import { cn } from "@/lib/utils";

interface WhatsAppShareButtonProps {
  team: TeamRow;
  opts?: GenerateTeamTextOpts & { phone?: string };
  className?: string;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline" | "ghost" | "secondary";
  label?: string;
  showIcon?: boolean;
}

export function WhatsAppShareButton({
  team,
  opts,
  className,
  size = "sm",
  variant = "default",
  label = "Share on WhatsApp",
  showIcon = true,
}: WhatsAppShareButtonProps) {
  const [opening, setOpening] = useState(false);

  function handleClick() {
    setOpening(true);
    try {
      const text = generateTeamText(team, opts);
      const url = generateWhatsAppLink(text, opts?.phone);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.warn("[WhatsAppShareButton] failed:", err);
    } finally {
      // Brief visual feedback
      setTimeout(() => setOpening(false), 600);
    }
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={handleClick}
      className={cn(
        "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold",
        className
      )}
      title="Share team on WhatsApp"
    >
      {opening ? (
        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
      ) : showIcon ? (
        <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
      ) : (
        <Share2 className="w-3.5 h-3.5 mr-1.5" />
      )}
      {label}
    </Button>
  );
}

export default WhatsAppShareButton;
