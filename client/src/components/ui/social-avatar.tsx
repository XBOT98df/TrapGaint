'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface SocialAvatarProps {
  name: string;
  src?: string | null;
  className?: string;
  imageClassName?: string;
  initialClassName?: string;
  shapeClassName?: string;
}

function getAvatarInitial(name: string) {
  const trimmed = name.trim();
  if (!trimmed) {
    return '?';
  }

  return trimmed[0].toUpperCase();
}

export function SocialAvatar({
  name,
  src,
  className,
  imageClassName,
  initialClassName,
  shapeClassName = 'rounded-[28%]',
}: SocialAvatarProps) {
  const [hasImageError, setHasImageError] = useState(!src);

  useEffect(() => {
    setHasImageError(!src);
  }, [src]);

  return (
    <div
      className={cn(
        'relative isolate overflow-hidden bg-[#0f1318] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_30px_rgba(0,0,0,0.34)]',
        shapeClassName,
        className,
      )}
    >
      {!hasImageError && src ? (
        <>
          <img
            src={src}
            alt={name}
            className={cn('h-full w-full object-cover', imageClassName)}
            onError={() => setHasImageError(true)}
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.14),transparent_38%,rgba(0,0,0,0.24))]" />
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(167,193,214,0.24),transparent_34%),linear-gradient(145deg,#343b44_0%,#20262f_42%,#0f141c_100%)]" />
          <div className="absolute inset-[6%] rounded-[24%] border border-white/7" />
          <div className="absolute inset-x-[18%] bottom-[-10%] h-[45%] rounded-full bg-cyan-300/18 blur-xl" />
          <span
            className={cn(
              'relative z-10 flex h-full w-full items-center justify-center text-[#82f4ff] font-semibold tracking-[0.08em] drop-shadow-[0_0_18px_rgba(130,244,255,0.18)]',
              initialClassName,
            )}
          >
            {getAvatarInitial(name)}
          </span>
        </>
      )}
    </div>
  );
}
