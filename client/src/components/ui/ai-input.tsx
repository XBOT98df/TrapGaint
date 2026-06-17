"use client";

import { CornerRightUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { useAutoResizeTextarea } from "@/components/hooks/use-auto-resize-textarea";

interface AIInputProps {
  id?: string
  placeholder?: string
  minHeight?: number
  maxHeight?: number
  onSubmit?: (value: string) => void
  className?: string
  disabled?: boolean
}

export function AIInput({
  id = "ai-input",
  placeholder = "Type your message...",
  minHeight = 52,
  maxHeight = 200,
  onSubmit,
  className,
  disabled = false,
}: AIInputProps) {
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight,
    maxHeight,
  });

  const [inputValue, setInputValue] = useState("");

  const handleReset = () => {
    if (!inputValue.trim() || disabled) return;
    onSubmit?.(inputValue);
    setInputValue("");
    adjustHeight(true);
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="relative w-full">
        <Textarea
          id={id}
          placeholder={placeholder}
          className={cn(
            "w-full bg-zinc-900 dark:bg-zinc-900 rounded-3xl pl-6 pr-12",
            "placeholder:text-zinc-500 dark:placeholder:text-zinc-500",
            "border border-zinc-800 dark:border-zinc-800",
            "text-white dark:text-white text-wrap",
            "overflow-y-auto resize-none",
            "focus-visible:ring-1 focus-visible:ring-zinc-700 focus-visible:ring-offset-0",
            "transition-[height] duration-100 ease-out",
            "leading-[1.2] py-[12px]",
            `min-h-[${minHeight}px]`,
            `max-h-[${maxHeight}px]`,
            "[&::-webkit-resizer]:hidden"
          )}
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            adjustHeight();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleReset();
            }
          }}
          disabled={disabled}
        />
        <button
          onClick={handleReset}
          type="button"
          disabled={disabled}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 right-3",
            "rounded-xl bg-zinc-800 dark:bg-zinc-800 py-1.5 px-1.5",
            "transition-all duration-200 hover:bg-zinc-700",
            inputValue ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
          )}
        >
          <CornerRightUp className="w-4 h-4 text-zinc-400 dark:text-zinc-400" />
        </button>
      </div>
    </div>
  );
}
