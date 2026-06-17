'use client';

import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronRight,
  Download,
  Flame,
  Loader2,
  Package,
  Search,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

interface ModResult {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  downloads: number;
  icon_url: string;
  author: string;
  source?: 'modrinth' | 'curseforge';
}

interface Shortcut {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

const SVGFilter = () => {
  return (
    <svg width="0" height="0">
      <filter id="blob">
        <feGaussianBlur stdDeviation="10" in="SourceGraphic" />
        <feColorMatrix
          values="1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 18 -9"
          result="blob"
        />
        <feBlend in="SourceGraphic" in2="blob" />
      </filter>
    </svg>
  );
};

interface ShortcutButtonProps {
  icon: React.ReactNode;
  onClick: () => void;
}

const ShortcutButton = ({ icon, onClick }: ShortcutButtonProps) => {
  return (
    <div 
      onClick={onClick}
      className="rounded-full cursor-pointer hover:shadow-lg opacity-60 hover:opacity-100 transition-[opacity,shadow] duration-200"
    >
      <div className="size-14 aspect-square flex items-center justify-center">
        {icon}
      </div>
    </div>
  );
};

interface SpotlightPlaceholderProps {
  text: string;
  className?: string;
}

const SpotlightPlaceholder = ({ text, className }: SpotlightPlaceholderProps) => {
  return (
    <motion.div
      layout
      className={cn(
        'absolute text-white/40 flex items-center pointer-events-none z-10',
        className
      )}
    >
      <AnimatePresence mode="popLayout">
        <motion.p
          layoutId={`placeholder-${text}`}
          key={`placeholder-${text}`}
          initial={{ opacity: 0, y: 10, filter: 'blur(5px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -10, filter: 'blur(5px)' }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {text}
        </motion.p>
      </AnimatePresence>
    </motion.div>
  );
};

interface SpotlightInputProps {
  placeholder: string;
  hidePlaceholder: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholderClassName?: string;
}

const SpotlightInput = ({
  placeholder,
  hidePlaceholder,
  value,
  onChange,
  onSubmit,
  placeholderClassName
}: SpotlightInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSubmit();
    }
  };

  return (
    <div className="flex items-center w-full justify-start gap-3 px-5 h-14">
      <motion.div layoutId="search-icon" className="text-white/60">
        <Search className="size-5" />
      </motion.div>
      <div className="flex-1 relative text-lg">
        {!hidePlaceholder && (
          <SpotlightPlaceholder text={placeholder} className={placeholderClassName} />
        )}
        <motion.input
          ref={inputRef}
          layout="position"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent outline-none ring-none text-white font-premium"
        />
      </div>
    </div>
  );
};


const formatDownloads = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

interface SearchResultCardProps {
  mod: ModResult;
  isLast: boolean;
  onClick: () => void;
}

const SearchResultCard = ({ mod, isLast, onClick }: SearchResultCardProps) => {
  return (
    <div 
      onClick={onClick}
      className="overflow-hidden w-full group/card cursor-pointer"
    >
      <div
        className={cn(
          'flex items-center text-white justify-start hover:bg-white/10 gap-3 py-2.5 px-3 rounded-xl transition-colors w-full',
          isLast && 'rounded-b-2xl'
        )}
      >
        <div className="size-10 rounded-lg overflow-hidden bg-white/10 shrink-0">
          {mod.icon_url ? (
            <img src={mod.icon_url} alt={mod.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="size-5 text-white/40" />
            </div>
          )}
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <p className="font-premium font-medium text-white truncate">{mod.title}</p>
          <p className="text-xs text-white/50 truncate">{mod.description}</p>
        </div>
        <div className="flex items-center gap-2 text-white/40 text-xs">
          <Download className="size-3" />
          <span>{formatDownloads(mod.downloads)}</span>
        </div>
        <div className="flex items-center justify-end opacity-0 group-hover/card:opacity-100 transition-opacity duration-200">
          <ChevronRight className="size-5 text-white" />
        </div>
      </div>
    </div>
  );
};

interface SearchResultsContainerProps {
  searchResults: ModResult[];
  isLoading: boolean;
  onModClick: (mod: ModResult) => void;
}

const SearchResultsContainer = ({ searchResults, isLoading, onModClick }: SearchResultsContainerProps) => {
  if (isLoading) {
    return (
      <motion.div
        layout
        className="px-3 border-t border-white/10 flex items-center justify-center py-8"
      >
        <Loader2 className="size-6 text-white animate-spin" />
      </motion.div>
    );
  }

  if (searchResults.length === 0) {
    return (
      <motion.div
        layout
        className="px-3 border-t border-white/10 flex flex-col items-center justify-center py-8 text-white/50"
      >
        <Package className="size-8 mb-2" />
        <p className="text-sm font-premium">No mods found</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      className="px-2 border-t border-white/10 flex flex-col max-h-80 overflow-y-auto w-full py-2 scrollbar-hide"
    >
      {searchResults.map((mod, index) => {
        return (
          <motion.div
            key={`search-result-${mod.project_id}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              delay: index * 0.05,
              duration: 0.2,
              ease: 'easeOut'
            }}
          >
            <SearchResultCard
              mod={mod}
              isLast={index === searchResults.length - 1}
              onClick={() => onModClick(mod)}
            />
          </motion.div>
        );
      })}
    </motion.div>
  );
};


interface ModSpotlightProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string) => Promise<ModResult[]>;
  onModSelect: (mod: ModResult) => void;
  shortcuts?: Shortcut[];
}

const ModSpotlight = ({
  isOpen,
  onClose,
  onSearch,
  onModSelect,
  shortcuts = [
    {
      label: 'Popular',
      icon: <Flame className="text-white" />,
      onClick: () => {}
    },
    {
      label: 'Trending',
      icon: <TrendingUp className="text-white" />,
      onClick: () => {}
    },
    {
      label: 'New',
      icon: <Sparkles className="text-white" />,
      onClick: () => {}
    },
    {
      label: 'Featured',
      icon: <Star className="text-white" />,
      onClick: () => {}
    }
  ]
}: ModSpotlightProps) => {
  const [hovered, setHovered] = useState(false);
  const [hoveredShortcut, setHoveredShortcut] = useState<number | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [searchResults, setSearchResults] = useState<ModResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearchValueChange = (value: string) => {
    setSearchValue(value);
    if (!value) {
      setSearchResults([]);
      setHasSearched(false);
    }
  };

  const handleSearch = async () => {
    if (!searchValue.trim()) return;
    
    setIsSearching(true);
    setHasSearched(true);
    try {
      const results = await onSearch(searchValue);
      setSearchResults(results);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleModClick = (mod: ModResult) => {
    onModSelect(mod);
    onClose();
    setSearchValue('');
    setSearchResults([]);
    setHasSearched(false);
  };

  // Reset state when closing
  useEffect(() => {
    if (!isOpen) {
      setSearchValue('');
      setSearchResults([]);
      setHasSearched(false);
      setHovered(false);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          initial={{
            opacity: 0,
            filter: 'blur(20px)',
            scale: 0.95,
            y: -20
          }}
          animate={{
            opacity: 1,
            filter: 'blur(0px)',
            scale: 1,
            y: 0
          }}
          exit={{
            opacity: 0,
            filter: 'blur(20px)',
            scale: 0.95,
            y: -20
          }}
          transition={{
            stiffness: 550,
            damping: 50,
            type: 'spring'
          }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-start pt-32"
          onClick={onClose}
        >
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />
          
          <SVGFilter />
          <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => {
              setHovered(false);
              setHoveredShortcut(null);
            }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'w-full flex items-center justify-end gap-3 z-20 group',
              '[&>div]:bg-zinc-900/90 [&>div]:text-white [&>div]:rounded-full [&>div]:backdrop-blur-xl',
              '[&_svg]:size-6 [&_svg]:stroke-[1.5]',
              'max-w-2xl px-4'
            )}
          >
            <AnimatePresence mode="popLayout">
              <motion.div
                layoutId="search-input-container"
                transition={{
                  layout: {
                    duration: 0.5,
                    type: 'spring',
                    bounce: 0.2
                  }
                }}
                style={{
                  borderRadius: '24px'
                }}
                className="h-full w-full flex flex-col items-center justify-start z-10 relative shadow-2xl overflow-hidden border border-white/10"
              >
                <SpotlightInput
                  placeholder={
                    hoveredShortcut !== null
                      ? shortcuts[hoveredShortcut].label
                      : 'Search mods on Modrinth...'
                  }
                  placeholderClassName={hoveredShortcut !== null ? 'text-white/70' : 'text-white/40'}
                  hidePlaceholder={!!searchValue}
                  value={searchValue}
                  onChange={handleSearchValueChange}
                  onSubmit={handleSearch}
                />
                {(hasSearched || isSearching) && (
                  <SearchResultsContainer
                    searchResults={searchResults}
                    isLoading={isSearching}
                    onModClick={handleModClick}
                  />
                )}
              </motion.div>
              {hovered &&
                !searchValue &&
                !hasSearched &&
                shortcuts.map((shortcut, index) => (
                  <motion.div
                    key={`shortcut-${index}`}
                    onMouseEnter={() => setHoveredShortcut(index)}
                    layout
                    initial={{ scale: 0.7, x: -1 * (56 * (index + 1)) }}
                    animate={{ scale: 1, x: 0 }}
                    exit={{
                      scale: 0.7,
                      x:
                        1 *
                        (14 * (shortcuts.length - index - 1) +
                          56 * (shortcuts.length - index - 1))
                    }}
                    transition={{
                      duration: 0.8,
                      type: 'spring',
                      bounce: 0.2,
                      delay: index * 0.05
                    }}
                    className="rounded-full cursor-pointer"
                  >
                    <ShortcutButton icon={shortcut.icon} onClick={shortcut.onClick} />
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>
          
          {/* Hint text */}
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-white/40 text-sm mt-4 z-20 font-premium"
          >
            Press <kbd className="px-1.5 py-0.5 bg-white/10 border border-white/20 rounded text-xs text-white/60">Enter</kbd> to search • <kbd className="px-1.5 py-0.5 bg-white/10 border border-white/20 rounded text-xs text-white/60">Esc</kbd> to close
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export { ModSpotlight };
export type { ModResult, Shortcut };
