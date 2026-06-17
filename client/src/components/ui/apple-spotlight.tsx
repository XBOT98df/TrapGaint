'use client';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Calendar,
  ChevronRight,
  Files,
  Folder,
  Globe,
  Image,
  LayoutGrid,
  Mail,
  MessageSquare,
  Music,
  Search,
  Settings,
  StickyNote,
  Terminal,
  Twitter
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

interface Shortcut {
  label: string;
  icon: React.ReactNode;
  link: string;
}

interface SearchResult {
  icon: React.ReactNode;
  label: string;
  description: string;
  link: string;
  onClick?: () => void;
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
  link: string;
}

const ShortcutButton = ({ icon, link }: ShortcutButtonProps) => {
  return (
    <a href={link} target="_blank">
      <div className="rounded-full cursor-pointer hover:shadow-lg opacity-30 hover:opacity-100 transition-[opacity,shadow] duration-200">
        <div className="size-16 aspect-square flex items-center justify-center">
          {icon}
        </div>
      </div>
    </a>
  );
};

interface SpotlightPlaceholderProps {
  text: string;
  className?: string;
}

const SpotlightPlaceholder = ({ text, className }: SpotlightPlaceholderProps) => {
  return (
    <div
      className={cn(
        'absolute text-white/40 flex items-center pointer-events-none z-10',
        className
      )}
    >
      <p>{text}</p>
    </div>
  );
};

interface SpotlightInputProps {
  placeholder: string;
  hidePlaceholder: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholderClassName?: string;
}

const SpotlightInput = ({
  placeholder,
  hidePlaceholder,
  value,
  onChange,
  placeholderClassName
}: SpotlightInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the input when the component mounts
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex items-center w-full justify-start gap-2 px-6 h-16">
      <Search className="w-7 h-7 text-white flex-shrink-0" />
      <div className="flex-1 relative text-2xl">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent outline-none ring-none text-white placeholder:text-white/40 border-none focus:ring-0"
        />
      </div>
    </div>
  );
};

interface SearchResultCardProps extends SearchResult {
  isLast: boolean;
}

const SearchResultCard = ({
  icon,
  label,
  description,
  link,
  isLast,
  onClick
}: SearchResultCardProps) => {
  const handleClick = (e: React.MouseEvent) => {
    if (onClick) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <a 
      href={link} 
      target="_blank" 
      className="overflow-hidden w-full group/card block"
      onClick={handleClick}
    >
      <div
        className={cn(
          'flex items-center text-white justify-start hover:bg-white/10 gap-3 py-3 px-3 rounded-xl transition-all duration-150 w-full cursor-pointer',
          isLast && 'rounded-b-3xl'
        )}
      >
        <div className="size-8 [&_svg]:stroke-[1.5] [&_svg]:size-6 aspect-square flex items-center justify-center flex-shrink-0 overflow-hidden rounded-lg">
          {icon}
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <p className="font-medium truncate">{label}</p>
          <p className="text-xs opacity-50 truncate">{description}</p>
        </div>
        <div className="flex items-center justify-end opacity-0 group-hover/card:opacity-100 transition-opacity duration-150 flex-shrink-0">
          <ChevronRight className="size-5" />
        </div>
      </div>
    </a>
  );
};

interface SearchResultsContainerProps {
  searchResults: SearchResult[];
  onHover: (index: number | null) => void;
}

const SearchResultsContainer = ({
  searchResults,
  onHover
}: SearchResultsContainerProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      onMouseLeave={() => onHover(null)}
      className="px-2 border-t border-white/10 flex flex-col max-h-96 overflow-y-auto w-full py-2 scrollbar-hide"
    >
      {searchResults.map((result, index) => {
        return (
          <div
            key={`search-result-${index}`}
            onMouseEnter={() => onHover(index)}
          >
            <SearchResultCard
              icon={result.icon}
              label={result.label}
              description={result.description}
              link={result.link}
              onClick={result.onClick}
              isLast={index === searchResults.length - 1}
            />
          </div>
        );
      })}
    </motion.div>
  );
};

interface AppleSpotlightProps {
  shortcuts?: Shortcut[];
  isOpen?: boolean;
  handleClose?: () => void;
  searchResults?: SearchResult[];
  onSearch?: (query: string) => void;
  isLoading?: boolean;
}

const AppleSpotlight = ({
  shortcuts = [
    {
      label: 'Apps',
      icon: <LayoutGrid />,
      link: '/docs/components'
    },
    {
      label: 'Files',
      icon: <Folder />,
      link: '/docs/texts'
    },
    {
      label: 'Actions',
      icon: <Activity />,
      link: '/docs/buttons'
    },
    {
      label: 'Clipboard',
      icon: <Files />,
      link: '/docs/backgrounds'
    }
  ],
  isOpen = true,
  handleClose = () => {},
  searchResults: customSearchResults,
  onSearch,
  isLoading = false
}: AppleSpotlightProps) => {
  const [hovered, setHovered] = useState(false);
  const [hoveredSearchResult, setHoveredSearchResult] = useState<number | null>(null);
  const [hoveredShortcut, setHoveredShortcut] = useState<number | null>(null);
  const [searchValue, setSearchValue] = useState('');

  const handleSearchValueChange = (value: string) => {
    setSearchValue(value);
    if (onSearch) {
      onSearch(value);
    }
  };

  // Use custom search results if provided, otherwise use default
  const searchResults = customSearchResults || [];

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          initial={{
            opacity: 0,
            scale: 0.95,
            y: -20
          }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0
          }}
          exit={{
            opacity: 0,
            scale: 0.95,
            y: -20
          }}
          transition={{
            duration: 0.2,
            ease: [0.16, 1, 0.3, 1]
          }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-md"
          onClick={handleClose}
        >
          <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => {
              setHovered(false);
              setHoveredShortcut(null);
            }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'w-full flex items-center justify-end gap-4 z-20 group',
              '[&>div]:text-white [&>div]:rounded-full [&>div]:backdrop-blur-xl',
              '[&_svg]:size-7 [&_svg]:stroke-[1.4]',
              'max-w-3xl'
            )}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key="search-container"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{
                  duration: 0.15,
                  ease: [0.16, 1, 0.3, 1]
                }}
                style={{
                  borderRadius: '30px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  backdropFilter: 'blur(20px)'
                }}
                className="h-full w-full flex flex-col items-center justify-start z-10 relative shadow-lg overflow-hidden border border-white/10"
              >
                <SpotlightInput
                  placeholder="Search mods..."
                  placeholderClassName="text-white/40"
                  hidePlaceholder={false}
                  value={searchValue}
                  onChange={handleSearchValueChange}
                />
                {searchValue && (
                  <SearchResultsContainer
                    searchResults={searchResults}
                    onHover={setHoveredSearchResult}
                  />
                )}
              </motion.div>
              {hovered &&
                !searchValue &&
                shortcuts.map((shortcut, index) => (
                  <motion.div
                    key={`shortcut-${index}`}
                    onMouseEnter={() => setHoveredShortcut(index)}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{
                      duration: 0.15,
                      delay: index * 0.03
                    }}
                    className="rounded-full cursor-pointer"
                  >
                    <ShortcutButton icon={shortcut.icon} link={shortcut.link} />
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export { AppleSpotlight };
