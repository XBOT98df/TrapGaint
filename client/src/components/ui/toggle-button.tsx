import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ToggleButtonProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ToggleButton({ 
  checked = false, 
  onChange, 
  disabled = false,
  label,
  size = 'md'
}: ToggleButtonProps) {
  const handleToggle = () => {
    if (!disabled && onChange) {
      onChange(!checked);
    }
  };

  const sizeClasses = {
    sm: 'w-10 h-6',
    md: 'w-12 h-7',
    lg: 'w-14 h-8'
  };

  const dotSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleToggle}
        disabled={disabled}
        className={cn(
          "relative rounded-full p-0.5 transition-all duration-300",
          sizeClasses[size],
          checked 
            ? "bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-[0_0_20px_rgba(34,197,94,0.3)]" 
            : "bg-zinc-800 border border-zinc-700",
          disabled && "opacity-50 cursor-not-allowed",
          !disabled && "cursor-pointer hover:scale-105"
        )}
      >
        {/* Background glow effect when checked */}
        {checked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 rounded-full bg-emerald-400/20 blur-md"
          />
        )}

        {/* Sliding dot */}
        <motion.div
          initial={false}
          animate={{
            x: checked ? (size === 'sm' ? 16 : size === 'lg' ? 24 : 20) : 0,
          }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30
          }}
          className={cn(
            "relative rounded-full shadow-lg",
            dotSizes[size],
            checked 
              ? "bg-white" 
              : "bg-zinc-400"
          )}
        >
          {/* Inner dot indicator */}
          <motion.div
            initial={false}
            animate={{
              scale: checked ? 1 : 0,
              opacity: checked ? 1 : 0
            }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-emerald-500"
          />
        </motion.div>
      </button>

      {label && (
        <span className={cn(
          "text-sm font-medium transition-colors",
          checked ? "text-white" : "text-zinc-400",
          disabled && "opacity-50"
        )}>
          {label}
        </span>
      )}
    </div>
  );
}
