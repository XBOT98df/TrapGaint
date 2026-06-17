'use client';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, UserPlus, Users, Loader2, ChevronRight } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { SocialAvatar } from '@/components/ui/social-avatar';

interface FriendResult {
  xuid: string;
  gamertag: string;
  display_pic_raw?: string;
  gamerscore?: number;
  real_name?: string;
}

interface FriendSearchSpotlightProps {
  isOpen: boolean;
  onClose: () => void;
  onSearch: (query: string) => void;
  searchResults: FriendResult[];
  xboxFriends: FriendResult[];
  isSearching: boolean;
  onAddFriend: (friend: FriendResult) => void;
  isSending: boolean;
}

const SpotlightPlaceholder = ({ text }: { text: string }) => {
  return (
    <motion.div
      layout
      className="absolute text-gray-400 flex items-center pointer-events-none z-10"
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

const SpotlightInput = ({
  value,
  onChange,
  hidePlaceholder
}: {
  value: string;
  onChange: (value: string) => void;
  hidePlaceholder: boolean;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="flex items-center w-full justify-start gap-3 px-6 h-16">
      <motion.div layoutId="search-icon">
        <Search className="w-6 h-6 text-white/60" />
      </motion.div>
      <div className="flex-1 relative text-2xl">
        {!hidePlaceholder && (
          <SpotlightPlaceholder text="Search Xbox Gamertag..." />
        )}
        <motion.input
          ref={inputRef}
          layout="position"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent outline-none ring-none text-white"
          placeholder=""
        />
      </div>
    </div>
  );
};

const FriendCard = ({
  friend,
  onAdd,
  isLast,
  disabled
}: {
  friend: FriendResult;
  onAdd: () => void;
  isLast: boolean;
  disabled: boolean;
}) => {
  return (
    <button
      onClick={onAdd}
      disabled={disabled}
      className={cn(
        'w-full flex items-center justify-start gap-3 py-3 px-4 rounded-xl hover:bg-white/10 transition-colors group/card disabled:opacity-50',
        isLast && 'rounded-b-3xl'
      )}
    >
      <SocialAvatar
        name={friend.gamertag}
        src={friend.display_pic_raw}
        className="w-12 h-12 flex-shrink-0"
        initialClassName="text-lg"
      />
      <div className="flex flex-col items-start flex-1">
        <p className="font-medium text-white">{friend.gamertag}</p>
        <p className="text-xs text-white/50">
          {friend.real_name || `${friend.gamerscore || 0}G`}
        </p>
      </div>
      <div className="flex items-center gap-2 opacity-0 group-hover/card:opacity-100 transition-opacity">
        <UserPlus className="w-5 h-5 text-emerald-500" />
        <ChevronRight className="w-5 h-5 text-white/60" />
      </div>
    </button>
  );
};

const XboxFriendShortcut = ({
  friend,
  onAdd,
  disabled
}: {
  friend: FriendResult;
  onAdd: () => void;
  disabled: boolean;
}) => {
  return (
    <button
      onClick={onAdd}
      disabled={disabled}
      className="flex flex-col items-center gap-2 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
    >
      <SocialAvatar
        name={friend.gamertag}
        src={friend.display_pic_raw}
        className="w-16 h-16"
        initialClassName="text-xl"
      />
      <span className="text-xs text-white/60 truncate max-w-[80px]">
        {friend.gamertag}
      </span>
    </button>
  );
};

export const FriendSearchSpotlight = ({
  isOpen,
  onClose,
  onSearch,
  searchResults,
  xboxFriends,
  isSearching,
  onAddFriend,
  isSending
}: FriendSearchSpotlightProps) => {
  const [searchValue, setSearchValue] = useState('');
  const [hovered, setHovered] = useState(false);

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    onSearch(value);
  };

  const displayResults = searchValue ? searchResults : [];

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-md bg-black/40"
          onClick={onClose}
        >
          <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl flex items-center justify-end gap-4 z-20"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: -20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: -20 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="h-full w-full flex flex-col items-center justify-start z-10 relative shadow-2xl overflow-hidden border border-white/10 bg-zinc-900/95 backdrop-blur-xl rounded-3xl"
            >
              <SpotlightInput
                value={searchValue}
                onChange={handleSearchChange}
                hidePlaceholder={searchValue.length > 0}
              />

              {/* Loading State */}
              {isSearching && (
                <div className="flex items-center justify-center py-8 border-t border-white/10">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                  <span className="ml-2 text-white/60">Searching...</span>
                </div>
              )}

              {/* Search Results */}
              {!isSearching && displayResults.length > 0 && (
                <div className="px-2 border-t border-white/10 flex flex-col w-full py-2 max-h-96 overflow-y-auto">
                  {displayResults.map((result, index) => (
                    <div key={result.xuid}>
                      <FriendCard
                        friend={result}
                        onAdd={() => onAddFriend(result)}
                        isLast={index === displayResults.length - 1}
                        disabled={isSending}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* No Results */}
              {!isSearching && searchValue && displayResults.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 border-t border-white/10 text-white/40">
                  <Users className="w-12 h-12 mb-2" />
                  <p>No users found</p>
                  <p className="text-sm">Try a different gamertag</p>
                </div>
              )}

              {/* Xbox Friends Shortcuts */}
              {hovered && !searchValue && xboxFriends.length > 0 && (
                <div className="px-6 py-4 border-t border-white/10 w-full">
                  <p className="text-white/60 text-sm mb-3">Xbox Friends</p>
                  <div className="flex gap-4 overflow-x-auto pb-2">
                    {xboxFriends.slice(0, 8).map((friend) => (
                      <div key={friend.xuid}>
                        <XboxFriendShortcut
                          friend={friend}
                          onAdd={() => onAddFriend(friend)}
                          disabled={isSending}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
