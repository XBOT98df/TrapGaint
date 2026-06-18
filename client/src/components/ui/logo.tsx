import dragonLogo from "@assets/NewIcons.svg";

interface LogoProps {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  className?: string;
  tierColor?: string; // Add tier color prop
}

export function Logo({ size = "md", showText = true, className = "", tierColor }: LogoProps) {
  const sizes = {
    sm: { icon: 22, text: "text-lg" },
    md: { icon: 28, text: "text-xl" },
    lg: { icon: 36, text: "text-2xl" },
    xl: { icon: 48, text: "text-3xl" },
  };

  const { icon, text } = sizes[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Dragon Logo with tier color glow */}
      <img 
        src={dragonLogo} 
        alt="Resonance" 
        width={icon} 
        height={icon} 
        className="object-contain rounded-lg"
        style={tierColor ? {
          filter: `drop-shadow(0 0 8px ${tierColor})`
        } : {}}
      />

      {showText && (
        <span 
          className={`font-serif italic font-semibold tracking-tight ${text}`} 
          style={{ 
            fontFamily: 'Bebas Neue, sans-serif',
            color: tierColor || '#ffffff'
          }}
        >
          DRAGON CLIENT
        </span>
      )}
    </div>
  );
}
