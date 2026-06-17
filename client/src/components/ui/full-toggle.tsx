import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FullToggleProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

/**
 * FullToggle - Full-width toggle button with modern design
 * 
 * Features:
 * - Full-width responsive design
 * - Smooth animations
 * - Label support
 * - Gradient backgrounds
 */
export function FullToggle({ 
  checked = false, 
  onChange, 
  disabled = false,
  label,
  className 
}: FullToggleProps) {
  const handleToggle = () => {
    if (!disabled && onChange) {
      onChange(!checked);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={disabled}
      className={cn(
        "flex p-0.5 items-center rounded-full w-full h-10 overflow-hidden relative transition-all duration-300",
        checked 
          ? "bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-[0_0_20px_rgba(34,197,94,0.3)]" 
          : "bg-zinc-900 border border-zinc-800",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:scale-[1.02]",
        className
      )}
    >
      {/* Background pattern */}
      <div className="flex justify-center items-center absolute w-full h-full">
        <div className="shrink-0 opacity-5 bg-black w-full h-full overflow-hidden" />
      </div>

      {/* Content container */}
      <div className="flex items-center justify-between w-full h-full px-4 relative z-10">
        {/* Label */}
        {label && (
          <motion.span
            initial={false}
            animate={{
              x: checked ? 0 : 10,
              opacity: checked ? 1 : 0.7
            }}
            transition={{ duration: 0.3 }}
            className={cn(
              "text-sm font-medium",
              checked ? "text-white" : "text-zinc-400"
            )}
          >
            {label}
          </motion.span>
        )}

        {/* Indicator dot */}
        <motion.div
          initial={false}
          animate={{
            x: checked ? 0 : -10,
            scale: checked ? 1 : 0.8
          }}
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 30
          }}
          className="flex py-[5px] px-1 justify-center items-center gap-2.5"
        >
          <div 
            className={cn(
              "rounded-full w-1.5 h-1.5 transition-all duration-300",
              checked 
                ? "bg-white border-2 border-white" 
                : "border-[1.5px] border-zinc-600 bg-transparent"
            )}
          />
        </motion.div>
      </div>
    </button>
  );
}

export default FullToggle;
