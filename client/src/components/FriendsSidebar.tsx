import { useState, useEffect } from "react";
import { Users, Play, Loader2, UserPlus, Globe, X, Search, Check, XCircle, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import {
  getFriends,
  getPendingRequests,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
} from "@/lib/friendsService";

interface Friend {
  oderId: string;
  username: string;
  gameVersion?: string | null;
  loader?: string | null;
  serverIp?: string | null;
  serverPort?: number | null;
  worldName?: string | null;
  isOnline: boolean;
  lastSeen: number;
}

interface FriendRequest {
  id: string;
  fromId: string;
  toId: string;
  fromUsername: string;
  toUsername: string;
  status: 'pending';
  createdAt: number;
}

interface FriendSearchResult {
  oderId: string;
  username: string;
  isOnline: boolean;
}

async function fetchOutgoingRequests(userOderId: string): Promise<FriendRequest[]> {
  const { data, error } = await supabase
    .from("friends")
    .select("id, user_oder_id, friend_oder_id, created_at")
    .eq("user_oder_id", userOderId)
    .eq("status", "pending");

  if (error) throw error;

  const friendIds = (data || []).map((row) => row.friend_oder_id).filter(Boolean);
  const usernameById = new Map<string, string>();

  if (friendIds.length > 0) {
    const { data: users } = await supabase
      .from("dragon_users")
      .select("xuid, gamertag")
      .in("xuid", friendIds);

    (users || []).forEach((user) => {
      usernameById.set(user.xuid, user.gamertag || user.xuid);
    });
  }

  return (data || []).map((row) => ({
    id: row.id,
    fromId: row.user_oder_id,
    toId: row.friend_oder_id,
    fromUsername: usernameById.get(row.user_oder_id) || row.user_oder_id,
    toUsername: usernameById.get(row.friend_oder_id) || row.friend_oder_id,
    status: "pending" as const,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
  }));
}

async function fetchOnlineUsers(): Promise<Friend[]> {
  const { data, error } = await supabase
    .from("dragon_users")
    .select("xuid, gamertag, game_version, loader, server_ip, server_port, world_name, is_online, last_seen")
    .eq("is_online", true)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  return (data || []).map((row) => ({
    oderId: row.xuid,
    username: row.gamertag || row.xuid,
    gameVersion: row.game_version,
    loader: row.loader,
    serverIp: row.server_ip,
    serverPort: row.server_port,
    worldName: row.world_name,
    isOnline: !!row.is_online,
    lastSeen: row.last_seen ? new Date(row.last_seen).getTime() : Date.now(),
  }));
}

async function searchUsers(query: string): Promise<FriendSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data, error } = await supabase
    .from("dragon_users")
    .select("xuid, gamertag, is_online")
    .ilike("gamertag", `%${trimmed}%`)
    .order("updated_at", { ascending: false })
    .limit(25);

  if (error) throw error;

  return (data || []).map((row) => ({
    oderId: row.xuid,
    username: row.gamertag || row.xuid,
    isOnline: !!row.is_online,
  }));
}

async function declineFriendRequest(requestId: string): Promise<boolean> {
  const { error } = await supabase.from("friends").delete().eq("id", requestId);
  if (error) throw error;
  return true;
}

interface FriendsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentUsername: string;
  onJoinGame?: (friend: Friend) => void;
  tierColor?: string;
}

export function FriendsSidebar({ isOpen, onClose, currentUsername, onJoinGame, tierColor = '#ec4899' }: FriendsSidebarProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [globalPlayers, setGlobalPlayers] = useState<Friend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showGlobalPlayers, setShowGlobalPlayers] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const currentOderId = localStorage.getItem('lapetus_oder_id') || '';

  const fetchFriends = async () => {
    if (!currentOderId) {
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const [friendsList, incoming, outgoing] = await Promise.all([
        getFriends(currentOderId),
        getPendingRequests(currentOderId),
        fetchOutgoingRequests(currentOderId),
      ]);

      const normalizedFriends: Friend[] = friendsList.map((friend) => ({
        oderId: friend.friend_oder_id,
        username: friend.friend_status?.username || friend.friend_oder_id,
        gameVersion: friend.friend_status?.game_version ?? null,
        loader: friend.friend_status?.loader ?? null,
        serverIp: friend.friend_status?.server_ip ?? null,
        serverPort: friend.friend_status?.server_port ?? null,
        worldName: friend.friend_status?.world_name ?? null,
        isOnline: !!friend.friend_status?.is_online,
        lastSeen: friend.friend_status?.last_seen
          ? new Date(friend.friend_status.last_seen).getTime()
          : Date.now(),
      }));

      const normalizedIncoming: FriendRequest[] = incoming.map((request: any) => ({
        id: request.id,
        fromId: request.user_oder_id,
        toId: request.friend_oder_id,
        fromUsername: request.sender_username || request.user_oder_id,
        toUsername: currentUsername,
        status: "pending",
        createdAt: request.created_at ? new Date(request.created_at).getTime() : Date.now(),
      }));

      setFriends(normalizedFriends);
      setIncomingRequests(normalizedIncoming);
      setOutgoingRequests(outgoing);
    } catch (error) {
      console.error('Error fetching friends:', error);
      setFriends([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchGlobalPlayers = async () => {
    try {
      const sessions = await fetchOnlineUsers();
      
      // Filter out current user and existing friends
      const friendIds = friends.map(f => f.oderId);
      const filtered = sessions.filter(s => 
        s.oderId !== currentOderId && !friendIds.includes(s.oderId)
      );
      
      setGlobalPlayers(filtered as Friend[]);
    } catch (error) {
      console.error('Error fetching global players:', error);
      setGlobalPlayers([]);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await searchUsers(searchQuery);
      // Filter out current user, existing friends, and pending requests
      const friendIds = friends.map(f => f.oderId);
      const pendingIds = [...incomingRequests.map(r => r.fromId), ...outgoingRequests.map(r => r.toId)];
      const filtered = results.filter(r => 
        r.oderId !== currentOderId && 
        !friendIds.includes(r.oderId) &&
        !pendingIds.includes(r.oderId)
      );
      setSearchResults(filtered);
    } catch (error) {
      console.error('Error searching users:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequest = async (targetId: string, targetUsername: string) => {
    if (!currentOderId || !currentUsername) return;

    try {
      await sendFriendRequest(currentOderId, targetId || targetUsername);
      await fetchFriends();
      setSearchQuery("");
      setSearchResults([]);
    } catch (error) {
      console.error('Error sending friend request:', error);
    }
  };

  const handleAcceptRequest = async (request: FriendRequest) => {
    if (!currentOderId) return;

    try {
      await acceptFriendRequest(currentOderId, request.fromId);
      await fetchFriends();
    } catch (error) {
      console.error('Error accepting friend request:', error);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    try {
      const success = await declineFriendRequest(requestId);
      if (success) {
        await fetchFriends();
      }
    } catch (error) {
      console.error('Error declining friend request:', error);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!currentOderId) return;

    try {
      await removeFriend(currentOderId, friendId);
      await fetchFriends();
    } catch (error) {
      console.error('Error removing friend:', error);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    
    fetchFriends();
    
    // Poll for updates every 3 seconds (faster for better UX)
    const interval = setInterval(fetchFriends, 3000);
    return () => clearInterval(interval);
  }, [isOpen, currentOderId]);

  useEffect(() => {
    if (showGlobalPlayers && isOpen) {
      fetchGlobalPlayers();
      const interval = setInterval(fetchGlobalPlayers, 3000);
      return () => clearInterval(interval);
    }
  }, [showGlobalPlayers, isOpen, friends.length]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const debounce = setTimeout(handleSearch, 500);
      return () => clearTimeout(debounce);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const onlineFriends = friends.filter(f => f.isOnline);
  const offlineFriends = friends.filter(f => !f.isOnline);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-40"
          />
          
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-80 z-50 flex flex-col overflow-hidden"
            style={{
              background: `linear-gradient(180deg, ${tierColor}26 0%, rgba(0, 0, 0, 1) 30%, #000000 100%)`,
            }}
          >
            {/* Header */}
            <div className="p-5 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl text-white tracking-wide" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  Friends
                </h2>
                {incomingRequests.length > 0 && (
                  <div className="bg-pink-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {incomingRequests.length}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowGlobalPlayers(!showGlobalPlayers)}
                  className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                    showGlobalPlayers ? 'bg-white/20' : 'hover:bg-white/10'
                  }`}
                  title="Global Players"
                >
                  <Globe className="w-4 h-4 text-white" />
                </button>
                <button
                  onClick={() => setShowAddFriend(!showAddFriend)}
                  className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                    showAddFriend ? 'bg-white/20' : 'hover:bg-white/10'
                  }`}
                  title="Add Friend"
                >
                  <UserPlus className="w-4 h-4 text-white" />
                </button>
              </div>
            </div>

            {/* Add Friend Panel */}
            {showAddFriend && (
              <div className="p-4 border-b border-white/10 bg-black/20">
                <div className="flex gap-2 mb-3">
                  <Input
                    placeholder="Search username..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-white/40"
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="bg-white/10 hover:bg-white/20"
                  >
                    <Search className="w-4 h-4" />
                  </Button>
                </div>
                
                {searchResults.length > 0 && (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {searchResults.map((user) => (
                      <div
                        key={user.oderId}
                        className="flex items-center justify-between p-2 rounded bg-white/5 hover:bg-white/10"
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${user.isOnline ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                          <span className="text-white text-sm">{user.username}</span>
                        </div>
                        <Button
                          onClick={() => handleSendRequest(user.oderId, user.username)}
                          size="sm"
                          className="h-6 px-2 text-xs bg-pink-500/20 hover:bg-pink-500/30 text-pink-300"
                        >
                          Send Request
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Friends List */}
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                </div>
              ) : (
                <div className="space-y-1">
                  {/* Incoming Friend Requests */}
                  {incomingRequests.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-pink-400/80 uppercase tracking-wider px-2 py-2">
                        Friend Requests — {incomingRequests.length}
                      </p>
                      {incomingRequests.map((request) => (
                        <div
                          key={request.id}
                          className="p-2 rounded-lg bg-pink-500/10 border border-pink-500/20 hover:bg-pink-500/20 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Clock className="w-3 h-3 text-pink-400" />
                              <span className="text-white text-sm font-medium">{request.fromUsername}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => handleAcceptRequest(request)}
                              size="sm"
                              className="flex-1 h-7 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300"
                            >
                              <Check className="w-3 h-3 mr-1" />
                              Accept
                            </Button>
                            <Button
                              onClick={() => handleDeclineRequest(request.id)}
                              size="sm"
                              className="flex-1 h-7 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300"
                            >
                              <XCircle className="w-3 h-3 mr-1" />
                              Decline
                            </Button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Outgoing Friend Requests */}
                  {outgoingRequests.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-amber-400/80 uppercase tracking-wider px-2 py-2 mt-2">
                        Pending — {outgoingRequests.length}
                      </p>
                      {outgoingRequests.map((request) => (
                        <div
                          key={request.id}
                          className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Clock className="w-3 h-3 text-amber-400 animate-pulse" />
                              <span className="text-white text-sm">{request.toUsername}</span>
                            </div>
                            <Button
                              onClick={() => handleDeclineRequest(request.id)}
                              size="sm"
                              className="h-6 px-2 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Online Friends */}
                  {onlineFriends.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-emerald-400/80 uppercase tracking-wider px-2 py-2 mt-2">
                        Online — {onlineFriends.length}
                      </p>
                      {onlineFriends.map((friend) => (
                        <FriendItem
                          key={friend.oderId}
                          friend={friend}
                          onRemove={() => handleRemoveFriend(friend.oderId)}
                          onJoin={() => onJoinGame?.(friend)}
                          tierColor={tierColor}
                        />
                      ))}
                    </>
                  )}

                  {/* Offline Friends */}
                  {offlineFriends.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider px-2 py-2 mt-2">
                        Offline — {offlineFriends.length}
                      </p>
                      {offlineFriends.map((friend) => (
                        <FriendItem
                          key={friend.oderId}
                          friend={friend}
                          onRemove={() => handleRemoveFriend(friend.oderId)}
                          tierColor={tierColor}
                        />
                      ))}
                    </>
                  )}

                  {/* Empty State */}
                  {friends.length === 0 && incomingRequests.length === 0 && outgoingRequests.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 px-4">
                      <Users className="w-12 h-12 text-zinc-700 mb-3" />
                      <p className="text-zinc-400 text-sm text-center">No friends yet</p>
                      <p className="text-zinc-600 text-xs text-center mt-1">Click + to send friend requests</p>
                    </div>
                  )}

                  {/* Global Players */}
                  {showGlobalPlayers && globalPlayers.length > 0 && (
                    <>
                      <p className="text-xs font-medium text-purple-400/80 uppercase tracking-wider px-2 py-2 mt-4">
                        Global Players — {globalPlayers.length}
                      </p>
                      {globalPlayers.map((player) => (
                        <div
                          key={player.oderId}
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-emerald-500" />
                              <span className="text-white text-sm">{player.username}</span>
                            </div>
                            <Button
                              onClick={() => handleSendRequest(player.oderId, player.username)}
                              size="sm"
                              className="h-6 px-2 text-xs bg-pink-500/20 hover:bg-pink-500/30 text-pink-300"
                            >
                              Add
                            </Button>
                          </div>
                          {player.gameVersion && (
                            <p className="text-xs text-zinc-400 mt-1 ml-4">
                              {player.gameVersion} • {player.loader}
                            </p>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Friend Item Component
function FriendItem({ 
  friend, 
  onRemove, 
  onJoin,
  tierColor 
}: { 
  friend: Friend; 
  onRemove: () => void;
  onJoin?: () => void;
  tierColor: string;
}) {
  return (
    <div className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <div className={`w-2 h-2 rounded-full ${friend.isOnline ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">{friend.username}</p>
            {friend.isOnline && friend.gameVersion && (
              <p className="text-xs text-zinc-400 truncate">
                {friend.gameVersion} • {friend.loader}
              </p>
            )}
            {!friend.isOnline && (
              <p className="text-xs text-zinc-500">Offline</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {friend.isOnline && onJoin && (
            <button
              onClick={onJoin}
              className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/10"
              title="Join Game"
            >
              <Play className="w-3.5 h-3.5 text-emerald-400" />
            </button>
          )}
          <button
            onClick={onRemove}
            className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remove Friend"
          >
            <X className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
