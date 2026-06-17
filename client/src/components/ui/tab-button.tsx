import React from "react";
import { cn } from "@/lib/utils";

interface TabButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
}

export function TabButton({
  icon,
  label,
  isActive = false,
  className,
  ...props
}: TabButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 h-11 px-4 rounded-md",
        "text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        isActive
          ? "bg-zinc-900 text-white"
          : "bg-transparent text-zinc-400 hover:bg-zinc-900/50 hover:text-white",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-center">
        {icon}
      </div>
      <span className="text-sm font-medium leading-none">{label}</span>
    </button>
  );
}
