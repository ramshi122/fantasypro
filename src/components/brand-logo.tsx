import { cn } from "@/lib/utils";

interface BrandLogoProps {
  size?: number;
  className?: string;
  withText?: boolean;
  textClassName?: string;
  useImage?: boolean;
}

export function BrandLogo({
  size = 40,
  className,
  withText = false,
  textClassName,
  useImage = true,
}: BrandLogoProps) {
  // When useImage is true, render the actual uploaded logo image inside a
  // rounded container. Otherwise fall back to the gradient "AC" mark.
  if (useImage) {
    return (
      <div className={cn("flex items-center gap-2.5", className)}>
        <div
          className="rounded-xl overflow-hidden flex items-center justify-center shadow-md bg-white/5 ring-1 ring-amber-500/20 premium-inner-highlight"
          style={{ width: size, height: size }}
        >
          <img
            src="/logo-square.png"
            alt="Apna Cricket"
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to gradient mark if image fails to load
              (e.currentTarget as HTMLImageElement).style.display = "none";
              const parent = (e.currentTarget as HTMLImageElement).parentElement;
              if (parent) {
                parent.className = "brand-gradient rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/30 ring-1 ring-amber-300/30 premium-inner-highlight";
                parent.innerHTML = `<span style="font-size: ${size * 0.4}" class="font-black text-white leading-none">AC</span>`;
              }
            }}
          />
        </div>
        {withText && (
          <div className="flex flex-col leading-none">
            <span
              className={cn(
                "font-black brand-gradient-text tracking-tight",
                textClassName || "text-xl"
              )}
            >
              Apna Cricket
            </span>
            <span className="premium-micro-label text-amber-400/80 mt-1">
              Fantasy Team
            </span>
          </div>
        )}
      </div>
    );
  }

  // Fallback gradient mark
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className="brand-gradient rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/30 ring-1 ring-amber-300/30 premium-inner-highlight"
        style={{ width: size, height: size }}
      >
        <span
          className="font-black text-white leading-none"
          style={{ fontSize: size * 0.4 }}
        >
          AC
        </span>
      </div>
      {withText && (
        <div className="flex flex-col leading-none">
          <span
            className={cn(
              "font-black brand-gradient-text tracking-tight",
              textClassName || "text-xl"
            )}
          >
            Apna Cricket
          </span>
          <span className="premium-micro-label text-amber-400/80 mt-1">
            Fantasy Team
          </span>
        </div>
      )}
    </div>
  );
}
