import { motion } from "framer-motion";
import { ReactNode } from "react";

interface GlassButtonProps {
  children?: ReactNode;
  title: string;
  subtitle?: string;
  onClick?: () => void;
  variant?: "blue" | "green" | "danger" | "secondary";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
  icon?: ReactNode;
}

const variants = {
  blue: {
    bg: "bg-blue-500",
    border: "border-blue-400/50",
    shadow: "shadow-blue-500/20",
    hover: "hover:bg-blue-400",
  },
  green: {
    bg: "bg-[#3DF56B]",
    border: "border-[#3DF56B]/50",
    shadow: "shadow-[#3DF56B]/20",
    hover: "hover:bg-[#4dff7b]",
  },
  danger: {
    bg: "bg-red-500",
    border: "border-red-400/50",
    shadow: "shadow-red-500/20",
    hover: "hover:bg-red-400",
  },
  secondary: {
    bg: "bg-white/10",
    border: "border-white/20",
    shadow: "shadow-white/5",
    hover: "hover:bg-white/20",
  },
};

const sizes = {
  sm: "min-w-[160px] px-6 py-3",
  md: "min-w-[220px] px-8 py-4",
  lg: "min-w-[280px] px-10 py-5",
};

export function GlassButton({
  title,
  subtitle,
  onClick,
  variant = "blue",
  size = "lg",
  className = "",
  disabled = false,
  icon,
}: GlassButtonProps) {
  const v = variants[variant];
  const s = sizes[size];

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative overflow-hidden rounded-xl
        ${v.bg} ${v.border} border-2
        ${s}
        shadow-lg ${v.shadow}
        ${v.hover}
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
      whileHover={{ scale: disabled ? 1 : 1.02 }}
      whileTap={{ scale: disabled ? 1 : 0.98 }}
    >
      {/* Inner glow/highlight at top */}
      <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent rounded-t-xl" />
      
      {/* Content */}
      <div className="relative flex items-center gap-3">
        {icon && <span className="text-white/90">{icon}</span>}
        <div className="text-left">
          <div className={`font-bold tracking-wide ${variant === "green" ? "text-black" : "text-white"}`}>
            {title}
          </div>
          {subtitle && (
            <div className={`text-sm ${variant === "green" ? "text-black/60" : "text-white/60"}`}>
              {subtitle}
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}
