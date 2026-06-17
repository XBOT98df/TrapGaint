import * as React from 'react'
import { cn } from '@/lib/utils'

export interface AnimatedInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

function AnimatedInput({ 
  ref, 
  className, 
  type, 
  ...props 
}: AnimatedInputProps & { ref?: React.RefObject<HTMLInputElement | null> }) {
  return (
    <div className="group/input rounded-xl p-[2px] transition duration-300 relative border border-white/10 hover:border-[#3DF56B]/50 focus-within:border-[#3DF56B]">
      <input
        type={type}
        className={cn(
          `relative z-10 flex w-full rounded-xl border-none bg-zinc-900 px-4 py-3 text-base text-white transition duration-400 
          placeholder:text-zinc-500 
          focus-visible:outline-none 
          disabled:cursor-not-allowed disabled:opacity-50`,
          className,
        )}
        ref={ref}
        {...props}
      />
    </div>
  )
}

AnimatedInput.displayName = 'AnimatedInput'

export { AnimatedInput }
