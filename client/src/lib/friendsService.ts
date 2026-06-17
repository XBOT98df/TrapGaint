import { supabase, Friend, UserStatus, FriendWithStatus } from './supabase';

// Send friend request (supports both oder_id and username)
export async function sendFriendRequest(userOderId: string, friendIdentifier: string) {
  console.log('[Send Friend Request] From:', userOderId, 'To:', friendIdentifier);
  
  // First, try to find the user by oder_id or username (case-insensitive)
  let friendOderId = friendIdentifier;
  
  // Check if it's a username by looking it up in dragon_users (case-insensitive)
  // Use .limit(1) to get only the most recent user if there are duplicates
  const { data: userStatusList, error: lookupError } = await supabase
    .from('dragon_users')
    .select('xuid, gamertag')
    .or(`gamertag.ilike.${friendIdentifier},xuid.eq.${friendIdentifier}`)
    .order('updated_at', { ascending: false })
    .limit(1);
  
  if (userStatusList && userStatusList.length > 0) {
    const userStatus = userStatusList[0];
    friendOderId = userStatus.xuid;
    console.log('[Send Friend Request] Found user:', userStatus.gamertag, '(', friendOderId, ')');
  } else {
    console.error('[Send Friend Request] User not found in database:', friendIdentifier);
    if (lookupError) {
      console.error('[Send Friend Request] Lookup error:', lookupError);
    }
    throw new Error('❌ User not found. Make sure they have logged in at least once.');
  }
  
  // Prevent sending friend request to yourself
  if (friendOderId === userOderId) {
    throw new Error('🤔 You cannot send a friend request to yourself');
  }
  
  // Check if friend request already exists in either direction
  const { data: existingList } = await supabase
    .from('friends')
    .select('*')
    .or(`and(user_oder_id.eq.${userOderId},friend_oder_id.eq.${friendOderId}),and(user_oder_id.eq.${friendOderId},friend_oder_id.eq.${userOderId})`);
  
  if (existingList && existingList.length > 0) {
    const existing = existingList[0];
    console.log('[Send Friend Request] Request already exists:', existing);
    if (existing.status === 'pending') {
      if (existing.user_oder_id === userOderId) {
        throw new Error('⏳ Friend request already pending');
      } else {
        throw new Error('📬 This user has already sent you a friend request! Check your pending requests.');
      }
    } else if (existing.status === 'accepted') {
      throw new Error('✅ You are already friends with this user');
    }
  }
  
  const { data, error } = await supabase
    .from('friends')
    .insert({
      user_oder_id: userOderId,
      friend_oder_id: friendOderId,
      status: 'pending'
    })
    .select()
    .single();

  if (error) {
    console.error('[Send Friend Request] Error:', error);
    throw error;
  }
  
  console.log('[Send Friend Request] Success:', data);
  return data;
}

// Accept friend request
export async function acceptFriendRequest(userOderId: string, friendOderId: string) {
  console.log('[Accept Friend Request] User:', userOderId, 'accepting request from:', friendOderId);
  
  // Delete the original pending request
  const { error: deleteError } = await supabase
    .from('friends')
    .delete()
    .eq('user_oder_id', friendOderId)
    .eq('friend_oder_id', userOderId)
    .eq('status', 'pending');

  if (deleteError) {
    console.error('[Accept Friend Request] Error deleting pending request:', deleteError);
    throw deleteError;
  }

  // Create bidirectional friendship (both directions with 'accepted' status)
  const { error: error1 } = await supabase
    .from('friends')
    .insert({
      user_oder_id: userOderId,
      friend_oder_id: friendOderId,
      status: 'accepted'
    });

  if (error1) {
    console.error('[Accept Friend Request] Error creating friendship (direction 1):', error1);
    throw error1;
  }

  const { error: error2 } = await supabase
    .from('friends')
    .insert({
      user_oder_id: friendOderId,
      friend_oder_id: userOderId,
      status: 'accepted'
    });

  if (error2) {
    console.error('[Accept Friend Request] Error creating friendship (direction 2):', error2);
    throw error2;
  }
  
  console.log('[Accept Friend Request] Successfully accepted friend request');
}

// Get all friends for a user
export async function getFriends(userOderId: string): Promise<FriendWithStatus[]> {
  const { data, error } = await supabase
    .from('friends')
    .select('*')
    .eq('user_oder_id', userOderId)
    .eq('status', 'accepted');

  if (error) throw error;

  // Get status for each friend
  const friendsWithStatus = await Promise.all(
    (data || []).map(async (friend) => {
      const status = await getUserStatus(friend.friend_oder_id);
      return {
        ...friend,
        friend_status: status
      };
    })
  );

  return friendsWithStatus;
}

// Get pending friend requests with sender info
export async function getPendingRequests(userOderId: string) {
  console.log('[getPendingRequests] Fetching for user:', userOderId);
  
  const { data, error } = await supabase
    .from('friends')
    .select('*')
    .eq('friend_oder_id', userOderId)
    .eq('status', 'pending');

  console.log('[getPendingRequests] Query result:', { data, error });

  if (error) throw error;
  
  // Get sender info for each request
  const requestsWithInfo = await Promise.all(
    (data || []).map(async (request) => {
      const status = await getUserStatus(request.user_oder_id);
      console.log('[getPendingRequests] Sender status for', request.user_oder_id, ':', status);
      return {
        ...request,
        sender_username: status?.username || request.user_oder_id
      };
    })
  );
  
  console.log('[getPendingRequests] Final result:', requestsWithInfo);
  return requestsWithInfo;
}

// Update user status (online/offline)
export async function updateUserStatus(
  oderId: string,
  username: string,
  isOnline: boolean,
  currentGame: string | null = null,
  serverIp: string | null = null,
  gameVersion: string | null = null,
  loader: string | null = null,
  serverPort: number | null = null,
  worldName: string | null = null
) {
  const { data, error } = await supabase
    .from('dragon_users')
    .update({
      is_online: isOnline,
      current_game: currentGame,
      server_ip: serverIp,
      game_version: gameVersion,
      loader: loader,
      world_name: worldName,
      last_seen: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('xuid', oderId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get user status
export async function getUserStatus(oderId: string): Promise<UserStatus | null> {
  const { data, error } = await supabase
    .from('dragon_users')
    .select('*')
    .eq('xuid', oderId)
    .single();

  if (error) return null;
  
  // Map dragon_users fields to UserStatus format
  return {
    oder_id: data.xuid,
    username: data.gamertag,
    is_online: data.is_online,
    current_game: data.current_game,
    server_ip: data.server_ip,
    game_version: data.game_version,
    loader: data.loader,
    world_name: data.world_name,
    last_seen: data.last_seen,
    updated_at: data.updated_at
  } as UserStatus;
}

// Subscribe to friends updates
export function subscribeFriendsUpdates(userOderId: string, callback: (friends: FriendWithStatus[]) => void) {
  const channel = supabase
    .channel(`friends-${userOderId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'friends',
        filter: `user_oder_id=eq.${userOderId}`
      },
      async (payload) => {
        console.log('[Friends] Real-time update received:', payload);
        const friends = await getFriends(userOderId);
        console.log('[Friends] Updated friends:', friends);
        callback(friends);
      }
    )
    .subscribe();

  return channel;
}

// Subscribe to pending requests updates
export function subscribePendingRequestsUpdates(userOderId: string, callback: (requests: any[]) => void) {
  const channel = supabase
    .channel(`pending-requests-${userOderId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'friends',
        filter: `friend_oder_id=eq.${userOderId}`
      },
      async (payload) => {
        console.log('[Pending Requests] Real-time update received:', payload);
        const requests = await getPendingRequests(userOderId);
        console.log('[Pending Requests] Updated requests:', requests);
        callback(requests);
      }
    )
    .subscribe();

  return channel;
}

// Subscribe to user status updates
export function subscribeUserStatusUpdates(callback: (status: UserStatus) => void) {
  const channel = supabase
    .channel('user-status-changes')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'dragon_users'
      },
      (payload) => {
        // Map dragon_users fields to UserStatus format
        const dragonUser = payload.new as any;
        const userStatus: UserStatus = {
          oder_id: dragonUser.xuid,
          username: dragonUser.gamertag,
          is_online: dragonUser.is_online,
          current_game: dragonUser.current_game,
          server_ip: dragonUser.server_ip,
          game_version: dragonUser.game_version,
          loader: dragonUser.loader,
          world_name: dragonUser.world_name,
          last_seen: dragonUser.last_seen,
          updated_at: dragonUser.updated_at
        };
        callback(userStatus);
      }
    )
    .subscribe();

  return channel;
}

// Remove friend
export async function removeFriend(userOderId: string, friendOderId: string) {
  // Remove both directions
  await supabase
    .from('friends')
    .delete()
    .eq('user_oder_id', userOderId)
    .eq('friend_oder_id', friendOderId);

  await supabase
    .from('friends')
    .delete()
    .eq('user_oder_id', friendOderId)
    .eq('friend_oder_id', userOderId);
}

// Update user profile
export async function updateUserProfile(
  xuid: string,
  updates: {
    bio?: string;
  }
) {
  const { data, error } = await supabase
    .from('dragon_users')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('xuid', xuid)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get user profile
export async function getUserProfile(xuid: string) {
  const { data, error } = await supabase
    .from('dragon_users')
    .select('*')
    .eq('xuid', xuid)
    .single();

  if (error) return null;
  return data;
}

// XUID Store functions for Xbox Live friend requests
// These functions manage pending friend requests using dragon_users table

// Store a pending friend request in dragon_users table
export async function storePendingXboxRequest(
  senderXuid: string,
  receiverXuid: string,
  senderGamertag?: string,
  receiverGamertag?: string
) {
  console.log('[Friend Request] Storing pending request:', { senderXuid, receiverXuid, senderGamertag, receiverGamertag });
  
  try {
    // Check if receiver exists in database
    const { data: receiverCheck, error: receiverCheckError } = await supabase
      .from('dragon_users')
      .select('xuid, gamertag')
      .eq('xuid', receiverXuid)
      .single();
    
    if (receiverCheckError || !receiverCheck) {
      console.error('[Friend Request] Receiver not found in database:', receiverXuid);
      throw new Error('User not found. They need to log in to Dragon Launcher first.');
    }
    
    console.log('[Friend Request] Receiver found:', receiverCheck);
    
    // Add sender XUID to receiver's pending_received array
    const { data: receiver, error: fetchError } = await supabase
      .from('dragon_users')
      .select('pending_received')
      .eq('xuid', receiverXuid)
      .single();
    
    if (fetchError) {
      console.error('[Friend Request] Error fetching receiver:', fetchError);
      throw fetchError;
    }
    
    // Add sender to pending_received if not already there
    const pendingReceived = receiver?.pending_received || [];
    console.log('[Friend Request] Current pending_received:', pendingReceived);
    
    if (!pendingReceived.includes(senderXuid)) {
      pendingReceived.push(senderXuid);
      console.log('[Friend Request] Updated pending_received:', pendingReceived);
      
      const { error: updateError } = await supabase
        .from('dragon_users')
        .update({ pending_received: pendingReceived })
        .eq('xuid', receiverXuid);
      
      if (updateError) {
        console.error('[Friend Request] Error updating receiver:', updateError);
        throw updateError;
      }
      
      console.log('[Friend Request] ✓ Updated receiver pending_received');
    } else {
      console.log('[Friend Request] Request already exists in pending_received');
    }
    
    // Add receiver XUID to sender's pending_sent array
    const { data: sender, error: fetchSenderError } = await supabase
      .from('dragon_users')
      .select('pending_sent')
      .eq('xuid', senderXuid)
      .single();
    
    if (fetchSenderError) {
      console.error('[Friend Request] Error fetching sender:', fetchSenderError);
      throw fetchSenderError;
    }
    
    const pendingSent = sender?.pending_sent || [];
    console.log('[Friend Request] Current pending_sent:', pendingSent);
    
    if (!pendingSent.includes(receiverXuid)) {
      pendingSent.push(receiverXuid);
      console.log('[Friend Request] Updated pending_sent:', pendingSent);
      
      const { error: updateSenderError } = await supabase
        .from('dragon_users')
        .update({ pending_sent: pendingSent })
        .eq('xuid', senderXuid);
      
      if (updateSenderError) {
        console.error('[Friend Request] Error updating sender:', updateSenderError);
        throw updateSenderError;
      }
      
      console.log('[Friend Request] ✓ Updated sender pending_sent');
    } else {
      console.log('[Friend Request] Request already exists in pending_sent');
    }
    
    console.log('[Friend Request] ✓ Successfully stored pending request');
  } catch (error) {
    console.error('[Friend Request] Error:', error);
    throw error;
  }
}

// Get pending Xbox friend requests for a receiver
export async function getPendingXboxRequests(receiverXuid: string) {
  console.log('[Friend Request] Fetching pending requests for receiver:', receiverXuid);
  
  try {
    // Get receiver's pending_received array
    const { data: receiver, error } = await supabase
      .from('dragon_users')
      .select('pending_received')
      .eq('xuid', receiverXuid)
      .single();
    
    if (error) {
      console.error('[Friend Request] Error fetching receiver:', error);
      return [];
    }
    
    const pendingXuids = receiver?.pending_received || [];
    console.log('[Friend Request] Pending XUIDs:', pendingXuids);
    
    if (pendingXuids.length === 0) {
      return [];
    }
    
    // Fetch profiles for all pending senders
    const { data: senders, error: sendersError } = await supabase
      .from('dragon_users')
      .select('xuid, gamertag, avatar_url, real_name, gamerscore')
      .in('xuid', pendingXuids);
    
    if (sendersError) {
      console.error('[Friend Request] Error fetching senders:', sendersError);
      return [];
    }
    
    console.log('[Friend Request] Found', senders?.length || 0, 'pending requests');
    
    // Transform to match expected format
    return (senders || []).map(sender => ({
      sender_xuid: sender.xuid,
      sender_gamertag: sender.gamertag,
      receiver_xuid: receiverXuid
    }));
  } catch (error) {
    console.error('[Friend Request] Error:', error);
    return [];
  }
}

// Update Xbox friend request status (accept/decline)
export async function updateXboxRequestStatus(
  senderXuid: string,
  receiverXuid: string,
  status: 'accepted' | 'declined'
) {
  console.log('[Friend Request] Updating request status:', { senderXuid, receiverXuid, status });
  
  try {
    if (status === 'accepted') {
      // Add to friends arrays for both users
      // Add sender to receiver's friends
      const { data: receiver, error: fetchReceiverError } = await supabase
        .from('dragon_users')
        .select('friends, pending_received')
        .eq('xuid', receiverXuid)
        .single();
      
      if (!fetchReceiverError && receiver) {
        const friends = receiver.friends || [];
        const pendingReceived = receiver.pending_received || [];
        
        if (!friends.includes(senderXuid)) {
          friends.push(senderXuid);
        }
        
        // Remove from pending
        const updatedPending = pendingReceived.filter(xuid => xuid !== senderXuid);
        
        await supabase
          .from('dragon_users')
          .update({ friends, pending_received: updatedPending })
          .eq('xuid', receiverXuid);
      }
      
      // Add receiver to sender's friends
      const { data: sender, error: fetchSenderError } = await supabase
        .from('dragon_users')
        .select('friends, pending_sent')
        .eq('xuid', senderXuid)
        .single();
      
      if (!fetchSenderError && sender) {
        const friends = sender.friends || [];
        const pendingSent = sender.pending_sent || [];
        
        if (!friends.includes(receiverXuid)) {
          friends.push(receiverXuid);
        }
        
        // Remove from pending
        const updatedPending = pendingSent.filter(xuid => xuid !== receiverXuid);
        
        await supabase
          .from('dragon_users')
          .update({ friends, pending_sent: updatedPending })
          .eq('xuid', senderXuid);
      }
    } else {
      // Just remove from pending arrays
      const { data: receiver } = await supabase
        .from('dragon_users')
        .select('pending_received')
        .eq('xuid', receiverXuid)
        .single();
      
      if (receiver) {
        const pendingReceived = receiver.pending_received || [];
        const updatedPending = pendingReceived.filter(xuid => xuid !== senderXuid);
        
        await supabase
          .from('dragon_users')
          .update({ pending_received: updatedPending })
          .eq('xuid', receiverXuid);
      }
      
      const { data: sender } = await supabase
        .from('dragon_users')
        .select('pending_sent')
        .eq('xuid', senderXuid)
        .single();
      
      if (sender) {
        const pendingSent = sender.pending_sent || [];
        const updatedPending = pendingSent.filter(xuid => xuid !== receiverXuid);
        
        await supabase
          .from('dragon_users')
          .update({ pending_sent: updatedPending })
          .eq('xuid', senderXuid);
      }
    }
    
    console.log('[Friend Request] ✓ Successfully updated request status');
  } catch (error) {
    console.error('[Friend Request] Error updating status:', error);
    throw error;
  }
}

// Delete Xbox friend request (cleanup after accept/decline)
export async function deleteXboxRequest(senderXuid: string, receiverXuid: string) {
  console.log('[Friend Request] Deleting request:', { senderXuid, receiverXuid });
  
  // This is now handled by updateXboxRequestStatus
  await updateXboxRequestStatus(senderXuid, receiverXuid, 'declined');
}

// Check if a pending request exists
export async function checkPendingXboxRequest(senderXuid: string, receiverXuid: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('dragon_users')
    .select('pending_received')
    .eq('xuid', receiverXuid)
    .single();

  if (error) {
    console.error('[Friend Request] Error checking pending request:', error);
    return false;
  }
  
  const pendingReceived = data?.pending_received || [];
  return pendingReceived.includes(senderXuid);
}

// Search Dragon Launcher users by username or gamertag
export async function searchDragonUsers(query: string, currentUserXuid?: string): Promise<any[]> {
  console.log('[Dragon Search] Searching for:', query, 'excluding XUID:', currentUserXuid);
  
  if (!query || query.length < 2) {
    return [];
  }
  
  // Search in dragon_users table by gamertag (case-insensitive)
  // Only return users with valid Xbox profiles (XUID not starting with 'lap_')
  let queryBuilder = supabase
    .from('dragon_users')
    .select('xuid, gamertag, minecraft_uuid, avatar_url, real_name, gamerscore, is_online, created_at')
    .ilike('gamertag', `%${query}%`)
    .not('xuid', 'like', 'lap_%'); // Exclude offline/local accounts
  
  // Exclude current user from results
  if (currentUserXuid) {
    queryBuilder = queryBuilder.neq('xuid', currentUserXuid);
  }
  
  const { data, error } = await queryBuilder
    .order('gamertag', { ascending: true })
    .limit(20);
  
  if (error) {
    console.error('[Dragon Search] Error:', error);
    return [];
  }
  
  console.log('[Dragon Search] Found', data?.length || 0, 'users with Xbox profiles');
  
  // Remove duplicates by gamertag (keep first occurrence)
  const uniqueUsers = new Map();
  (data || []).forEach(user => {
    if (!uniqueUsers.has(user.gamertag.toLowerCase())) {
      uniqueUsers.set(user.gamertag.toLowerCase(), user);
    }
  });
  
  // Transform to match Xbox profile format
  const results = Array.from(uniqueUsers.values()).map(user => ({
    gamertag: user.gamertag,
    xuid: user.xuid,
    display_pic_raw: user.avatar_url,
    real_name: user.real_name,
    gamerscore: user.gamerscore
  }));
  
  return results;
}
