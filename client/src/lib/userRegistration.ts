import { launcher, type AuthAccount } from "@/lib/launcher";
import { supabase } from "@/lib/supabase";

/**
 * Register or update user in Supabase dragon_users table
 * This should be called during startup/onboarding, NOT inside the main app
 */
export async function registerUserInSupabase(account: AuthAccount): Promise<void> {
  try {
    console.log('[Registration] Starting registration for:', account.username);
    
    // Check if we already have an XUID stored for THIS account
    const existingXuid = localStorage.getItem('lapetus_oder_id');
    
    // For Xbox accounts, always fetch and update XUID to ensure it's correct for current account
    if (account.refresh_token) {
      console.log('[Registration] Xbox account detected, will fetch current XUID...');
    } else if (existingXuid && !existingXuid.startsWith('lap_')) {
      console.log('[Registration] XUID already stored for offline account, skipping:', existingXuid);
      return; // Don't overwrite existing XUID for offline accounts
    }
    
    // For Xbox accounts, use the XUID
    // For offline accounts, use the lap_ prefix
    let xuid = `lap_${account.uuid.replace(/-/g, '').substring(0, 16)}`;
    console.log('[Registration] Initial XUID (lap_ format):', xuid);
    
    // Get Xbox profile for avatar and additional info
    let avatarUrl = null;
    let realName = null;
    let gamerscore = null;
    
    // If this is an Xbox account, try to get the XUID
    if (account.refresh_token) {
      console.log('[Registration] Xbox account detected, fetching XUID...');
      try {
        const xboxProfile = await launcher.getCurrentXboxProfile();
        console.log('[Registration] Xbox profile response:', xboxProfile);
        
        if (xboxProfile && xboxProfile.xuid) {
          xuid = xboxProfile.xuid;
          console.log('[Registration] Using Xbox XUID:', xuid);
          
          // Store in localStorage for easy access
          localStorage.setItem('lapetus_oder_id', xuid);
          console.log('[Registration] Stored XUID in localStorage');
          
          // Get avatar and profile info
          try {
            const searchResults = await launcher.searchXboxUsers(account.username);
            if (searchResults.length > 0 && searchResults[0].display_pic_raw) {
              avatarUrl = searchResults[0].display_pic_raw;
              realName = searchResults[0].real_name;
              gamerscore = searchResults[0].gamerscore;
            }
          } catch (profileError) {
            console.warn('[Registration] Could not fetch profile details:', profileError);
          }
        } else {
          console.warn('[Registration] Xbox profile returned but no XUID found');
        }
      } catch (error) {
        console.warn('[Registration] Could not get Xbox XUID, using lap_ format:', error);
      }
    } else {
      console.log('[Registration] Offline account, using lap_ format');
    }

    // Check for existing user with same gamertag but different XUID (duplicate)
    const { data: existingUsers } = await supabase
      .from('dragon_users')
      .select('xuid, gamertag')
      .eq('gamertag', account.username)
      .neq('xuid', xuid);
    
    if (existingUsers && existingUsers.length > 0) {
      console.log('[Registration] Found duplicate gamertag entries, cleaning up:', existingUsers);
      // Delete old entries with same gamertag but different XUID
      for (const oldUser of existingUsers) {
        await supabase
          .from('dragon_users')
          .delete()
          .eq('xuid', oldUser.xuid);
        console.log('[Registration] Deleted duplicate entry:', oldUser.xuid);
      }
    }

    // Upsert into dragon_users table (insert or update if exists)
    const { data, error } = await supabase
      .from('dragon_users')
      .upsert({
        xuid: xuid,
        gamertag: account.username,
        minecraft_uuid: account.uuid,
        avatar_url: avatarUrl,
        real_name: realName,
        gamerscore: gamerscore,
        is_online: true,
        last_seen: new Date().toISOString()
      }, {
        onConflict: 'xuid',
        ignoreDuplicates: false
      })
      .select();

    if (error) {
      console.warn('[Registration] Failed to register user:', error.message);
    } else {
      console.log('[Registration] ✓ User registered/updated in dragon_users:', data);
      
      // Store XUID in localStorage
      localStorage.setItem('lapetus_oder_id', xuid);
      localStorage.setItem('lapetus_username', account.username);
    }
  } catch (error) {
    console.error('[Registration] Error registering user:', error);
  }
}
