import React from 'react';
import { cn } from '@/lib/utils';

interface FigmaSwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  activeColor?: string;
  inactiveColor?: string;
  activeShadow?: string;
  inactiveShadow?: string;
  thumbBorderColor?: string;
}

export function FigmaSwitch({ 
  checked = false, 
  onChange, 
  disabled = false,
  className,
  activeColor = '#10b981',
  inactiveColor = '#3f3f46',
  activeShadow = '0 8px 22px -12px rgba(16, 185, 129, 0.9), inset 0 1px 0 rgba(255,255,255,0.18)',
  inactiveShadow = 'inset 0 1px 0 rgba(255,255,255,0.08)',
  thumbBorderColor = 'rgba(255,255,255,0.12)'
}: FigmaSwitchProps) {
  const handleClick = () => {
    if (onChange && !disabled) {
      onChange(!checked);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "relative flex items-center rounded-full w-16 h-7 transition-all duration-300",
        disabled && "opacity-50 cursor-not-allowed",
        !disabled && "cursor-pointer hover:scale-105 active:scale-95",
        className
      )}
      style={{
        backgroundColor: checked ? activeColor : inactiveColor,
        boxShadow: checked ? activeShadow : inactiveShadow,
      }}
    >
      {/* Toggle knob - larger white circle */}
      <div 
        className={cn(
          "absolute w-10 h-6 bg-white rounded-full shadow-lg transition-all duration-300 ease-out border",
          checked ? "translate-x-6" : "translate-x-0.5"
        )}
        style={{ borderColor: thumbBorderColor }}
      />
    </button>
  );
}

export default FigmaSwitch;
