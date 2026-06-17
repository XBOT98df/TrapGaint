import { cn } from "@/lib/utils";
import ShinyText from "./ShinyText";

interface VersionCardProps {
  version: string;
  displayName: string;
  loaderLabel?: string;
  installed: boolean;
  selected: boolean;
  hideVersionLabel?: boolean;
  subtitle?: string;
  contentAlignment?: "center" | "upper";
  subtitlePlacement?: "inline" | "border-float";
  loaderLabelPlacement?: "none" | "border-float-top";
  onClick: () => void;
}

export function VersionCard({
  version,
  displayName,
  loaderLabel,
  installed,
  selected,
  hideVersionLabel = false,
  subtitle,
  contentAlignment = "center",
  subtitlePlacement = "inline",
  loaderLabelPlacement = "none",
  onClick,
}: VersionCardProps) {
  // Extract the Minecraft version number (e.g., "1.21.11" from "1.21.11-forge-53.0.3")
  const mcVersion = displayName;
  const fullVersionName = version;
  const isUpperAligned = contentAlignment === "upper";
  const isFloatingSubtitle = subtitlePlacement === "border-float";
  const isFloatingLoaderLabel = loaderLabelPlacement === "border-float-top" && Boolean(loaderLabel);

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-full p-1 rounded-xl transition-all duration-200",
        "bg-black",
        "border border-white/10",
        "shadow-[0_4px_12px_rgb(0_0_0_/_0.15)]",
        "hover:shadow-[0_8px_16px_rgb(0_0_0_/_0.25)]",
        isFloatingSubtitle || isFloatingLoaderLabel ? "overflow-visible" : "overflow-hidden",
        selected && "ring-2 ring-white/20"
      )}
    >
      <div
        className={cn(
          "w-full p-4 rounded-lg relative",
          "bg-black",
          "border border-white/[0.08]",
          "text-white",
          "flex flex-col items-center gap-1 min-h-[100px]",
          isUpperAligned ? "justify-start pt-6" : "justify-center"
        )}
      >
        <div className="text-center relative z-10 w-full px-2">
          {installed ? (
            <>
              <ShinyText
                text={mcVersion}
                speed={2}
                delay={2}
                yoyo={false}
                className="font-bold block text-3xl"
                style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                color="#ffffff"
                shineColor="#10b981"
                spread={120}
                direction="left"
              />
              {!hideVersionLabel && (
                <div className="text-xs text-white/50 mt-1 font-mono break-words" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {fullVersionName}
                </div>
              )}
              {subtitle && !isFloatingSubtitle && (
                <div
                  className="mt-2 text-sm text-white/78 break-words leading-tight"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em" }}
                >
                  {subtitle}
                </div>
              )}
            </>
          ) : (
            <>
              <span className="font-bold text-white/30 block text-3xl" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                {mcVersion}
              </span>
              {!hideVersionLabel && (
                <div className="text-xs text-white/20 mt-1 font-mono break-words" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {fullVersionName}
                </div>
              )}
              {subtitle && !isFloatingSubtitle && (
                <div
                  className="mt-2 text-sm text-white/40 break-words leading-tight"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em" }}
                >
                  {subtitle}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {loaderLabel && isFloatingLoaderLabel && (
        <div
          className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/2 bg-black px-4 py-1 text-[13px] uppercase tracking-[0.18em] text-white/50 max-w-[80%] truncate"
          style={{ fontFamily: "'Bebas Neue', sans-serif" }}
        >
          {loaderLabel}
        </div>
      )}
      {subtitle && isFloatingSubtitle && (
        <div
          className="pointer-events-none absolute left-1/2 bottom-0 z-20 -translate-x-1/2 translate-y-1/2 bg-black px-4 py-1 text-sm text-white/88 max-w-[85%] truncate"
          style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.04em" }}
        >
          {subtitle}
        </div>
      )}
    </button>
  );
}
