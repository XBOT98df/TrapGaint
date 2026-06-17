import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface Button3DProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  className?: string;
}

const Button3D: React.FC<Button3DProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  className = ''
}) => {
  const [isPressed, setIsPressed] = useState(false);

  const variants = {
    primary: {
      base: 'bg-blue-500 text-white border-blue-700',
      shadow: '#1d4ed8',
      hover: 'hover:bg-blue-600'
    },
    secondary: {
      base: 'bg-zinc-700 text-white border-zinc-800',
      shadow: '#27272a',
      hover: 'hover:bg-zinc-600'
    },
    success: {
      base: 'bg-[#3DF56B] text-black border-[#2bc954]',
      shadow: '#1a9e3d',
      hover: 'hover:bg-[#32e85d]'
    },
    danger: {
      base: 'bg-red-500 text-white border-red-700',
      shadow: '#b91c1c',
      hover: 'hover:bg-red-600'
    },
    warning: {
      base: 'bg-yellow-500 text-black border-yellow-600',
      shadow: '#ca8a04',
      hover: 'hover:bg-yellow-600'
    }
  };

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg'
  };

  const currentVariant = variants[variant];
  const currentSize = sizes[size];

  const handleMouseDown = () => {
    if (!disabled) {
      setIsPressed(true);
    }
  };

  const handleMouseUp = () => {
    setIsPressed(false);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick && !disabled) {
      onClick(e);
    }
  };

  return (
    <motion.button
      className={`
        ${currentVariant.base}
        ${currentVariant.hover}
        font-bold
        rounded-xl
        border-b-4
        ${currentSize}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        focus:outline-none
        select-none
        flex
        items-center
        justify-center
        gap-2
        ${className}
      `}
      initial={{ 
        boxShadow: `0 6px 0 0 ${currentVariant.shadow}`,
        y: 0 
      }}
      whileHover={{ 
        scale: 1.02,
        boxShadow: `0 8px 0 0 ${currentVariant.shadow}`,
        transition: { duration: 0.1 }
      }}
      whileTap={{ 
        scale: 0.98,
        y: 4,
        boxShadow: `0 2px 0 0 ${currentVariant.shadow}`,
        transition: { duration: 0.1 }
      }}
      animate={{
        y: isPressed ? 4 : 0,
        boxShadow: isPressed 
          ? `0 2px 0 0 ${currentVariant.shadow}` 
          : `0 6px 0 0 ${currentVariant.shadow}`
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 20
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      disabled={disabled}
    >
      {children}
    </motion.button>
  );
};

export { Button3D };
export default Button3D;
