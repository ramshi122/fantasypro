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
      <div className={cn("flex items-center gap-2", className)}>
        <div
          className="rounded-xl overflow-hidden flex items-center justify-center shadow-md"
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
                parent.className = "brand-gradient rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/30";
                parent.innerHTML = `<span style="font-size: ${size * 0.4}" class="font-black text-white leading-none">AC</span>`;
              }
            }}
          />
        </div>
        {withText && (
          <div className="flex flex-col leading-none">
            <span
              className={cn(
                "font-extrabold brand-gradient-text text-xl tracking-tight",
                textClassName
              )}
            >
              Apna Cricket
            </span>
            <span className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">
              Fantasy Team
            </span>
          </div>
        )}
      </div>
    );
  }

  // Fallback gradient mark
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="brand-gradient rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/30"
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
              "font-extrabold brand-gradient-text text-xl tracking-tight",
              textClassName
            )}
          >
            Apna Cricket
          </span>
          <span className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">
            Fantasy Team
          </span>
        </div>
      )}
    </div>
  );
}
