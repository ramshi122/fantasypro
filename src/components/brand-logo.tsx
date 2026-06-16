import { cn } from "@/lib/utils";

interface BrandLogoProps {
  size?: number;
  className?: string;
  withText?: boolean;
  textClassName?: string;
}

export function BrandLogo({
  size = 40,
  className,
  withText = false,
  textClassName,
}: BrandLogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className="brand-gradient rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/30"
        style={{ width: size, height: size }}
      >
        <span
          className="font-black text-white leading-none"
          style={{ fontSize: size * 0.5 }}
        >
          F
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
            FantasyPro
          </span>
          <span className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">
            AI Team Generator
          </span>
        </div>
      )}
    </div>
  );
}
