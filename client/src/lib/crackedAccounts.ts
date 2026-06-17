// Cracked Accounts Management System

const SUPABASE_URL = "https://oafrooyagtdnzqtdqxtr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZnJvb3lhZ3RkbnpxdGRxeHRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDc4NDYsImV4cCI6MjA4NzIyMzg0Nn0.6ujY-6Iuyha7VCNh-Xh8Lu0M_-x0FJGk61duJM84r14";

export interface CrackedAccount {
  id: string;
  oder_id: string;
  username: string;
  password_hash: string;
  minecraft_uuid: string;
  skin_username?: string;
  created_at: string;
  updated_at: string;
  last_login?: string;
  is_active: boolean;
}

// Hash password using SHA-256
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Generate oder_id from username
export function generateOderId(username: string): string {
  const hash = username.toLowerCase().split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  const id = Math.abs(hash).toString(16).padStart(16, '0').substring(0, 16);
  return `lap_${id}`;
}

// Generate offline mode UUID from username
export function generateOfflineUUID(username: string): string {
  // This mimics Minecraft's offline UUID generation
  const namespace = '00000000-0000-0000-0000-000000000000';
  const name = `OfflinePlayer:${username}`;
  
  // Simple UUID v3 generation (MD5-based)
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash = hash & hash;
  }
  
  const hex = Math.abs(hash).toString(16).padStart(32, '0');
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;
}

// Create a new cracked account
export async function createCrackedAccount(
  username: string,
  password: string,
  skinUsername?: string
): Promise<{ success: boolean; account?: CrackedAccount; error?: string }> {
  try {
    // Validate username
    if (!username || username.length < 3 || username.length > 16) {
      return { success: false, error: 'Username must be between 3 and 16 characters' };
    }

    // Validate password
    if (!password || password.length < 4) {
      return { success: false, error: 'Password must be at least 4 characters' };
    }

    // Generate credentials
    const oderId = generateOderId(username);
    const minecraftUuid = generateOfflineUUID(username);
    const passwordHash = await hashPassword(password);

    // Check if username already exists
    const checkResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/cracked_accounts?username=eq.${username}`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        }
      }
    );

    if (checkResponse.ok) {
      const existing = await checkResponse.json();
      if (existing.length > 0) {
        return { success: false, error: 'Username already exists' };
      }
    }

    // Create account in Supabase
    const response = await fetch(`${SUPABASE_URL}/rest/v1/cracked_accounts`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        oder_id: oderId,
        username: username,
        password_hash: passwordHash,
        minecraft_uuid: minecraftUuid,
        skin_username: skinUsername || username,
        is_active: true
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to create cracked account:', error);
      return { success: false, error: 'Failed to create account' };
    }

    const accounts = await response.json();
    const account = accounts[0];

    // Store credentials locally
    localStorage.setItem('dragon_oder_id', oderId);
    localStorage.setItem('dragon_username', username);
    localStorage.setItem(`dragon_password_${minecraftUuid}`, passwordHash);

    return { success: true, account };
  } catch (error) {
    console.error('Error creating cracked account:', error);
    return { success: false, error: 'An error occurred while creating account' };
  }
}

// Verify cracked account credentials
export async function verifyCrackedAccount(
  username: string,
  password: string
): Promise<{ success: boolean; account?: CrackedAccount; error?: string }> {
  try {
    const passwordHash = await hashPassword(password);

    // Fetch account from Supabase
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/cracked_accounts?username=eq.${username}&password_hash=eq.${passwordHash}&is_active=eq.true`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        }
      }
    );

    if (!response.ok) {
      return { success: false, error: 'Failed to verify credentials' };
    }

    const accounts = await response.json();
    
    if (accounts.length === 0) {
      return { success: false, error: 'Invalid username or password' };
    }

    const account = accounts[0];

    // Update last login
    await fetch(`${SUPABASE_URL}/rest/v1/cracked_accounts?id=eq.${account.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        last_login: new Date().toISOString()
      })
    });

    // Store credentials locally
    localStorage.setItem('dragon_oder_id', account.oder_id);
    localStorage.setItem('dragon_username', account.username);
    localStorage.setItem(`dragon_password_${account.minecraft_uuid}`, passwordHash);

    return { success: true, account };
  } catch (error) {
    console.error('Error verifying cracked account:', error);
    return { success: false, error: 'An error occurred while verifying credentials' };
  }
}

// Update cracked account password
export async function updateCrackedAccountPassword(
  username: string,
  oldPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Verify old password first
    const verification = await verifyCrackedAccount(username, oldPassword);
    if (!verification.success || !verification.account) {
      return { success: false, error: 'Invalid current password' };
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password in Supabase
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/cracked_accounts?id=eq.${verification.account.id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password_hash: newPasswordHash
        })
      }
    );

    if (!response.ok) {
      return { success: false, error: 'Failed to update password' };
    }

    // Update local storage
    localStorage.setItem(`dragon_password_${verification.account.minecraft_uuid}`, newPasswordHash);

    return { success: true };
  } catch (error) {
    console.error('Error updating password:', error);
    return { success: false, error: 'An error occurred while updating password' };
  }
}

// Check if username exists in Supabase (for cracked accounts without password)
export async function checkUsernameExists(
  username: string
): Promise<{ exists: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/cracked_accounts?username=eq.${username}&is_active=eq.true`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        }
      }
    );

    if (!response.ok) {
      return { exists: false, error: 'Failed to check username' };
    }

    const accounts = await response.json();
    return { exists: accounts.length > 0 };
  } catch (error) {
    console.error('Error checking username:', error);
    return { exists: false, error: 'An error occurred while checking username' };
  }
}

// Register cracked account in Supabase (without password - for offline mode)
export async function registerCrackedAccountInSupabase(
  username: string,
  minecraftUuid: string
): Promise<{ success: boolean; oderId?: string; error?: string }> {
  try {
    // Generate credentials
    const oderId = generateOderId(username);

    // Check if username already exists
    const checkResult = await checkUsernameExists(username);
    if (checkResult.exists) {
      return { success: false, error: 'Username already taken' };
    }

    // Create account in Supabase (no password for offline mode)
    const response = await fetch(`${SUPABASE_URL}/rest/v1/cracked_accounts`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        oder_id: oderId,
        username: username,
        password_hash: '', // Empty for offline mode
        minecraft_uuid: minecraftUuid,
        skin_username: username,
        is_active: true
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Failed to register cracked account:', error);
      return { success: false, error: 'Failed to register account' };
    }

    console.log('Cracked account registered in Supabase:', username);
    return { success: true, oderId };
  } catch (error) {
    console.error('Error registering cracked account:', error);
    return { success: false, error: 'An error occurred while registering account' };
  }
}

// Get cracked account by oder_id
export async function getCrackedAccountByOderId(
  oderId: string
): Promise<{ success: boolean; account?: CrackedAccount; error?: string }> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/cracked_accounts?oder_id=eq.${oderId}&is_active=eq.true`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        }
      }
    );

    if (!response.ok) {
      return { success: false, error: 'Failed to fetch account' };
    }

    const accounts = await response.json();
    
    if (accounts.length === 0) {
      return { success: false, error: 'Account not found' };
    }

    return { success: true, account: accounts[0] };
  } catch (error) {
    console.error('Error fetching cracked account:', error);
    return { success: false, error: 'An error occurred while fetching account' };
  }
}

// Update cracked account skin
export async function updateCrackedAccountSkin(
  oderId: string,
  skinUsername: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[Supabase] Updating skin for oder_id:', oderId, 'to:', skinUsername);
    
    // Update skin in Supabase
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/cracked_accounts?oder_id=eq.${oderId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          skin_username: skinUsername,
          updated_at: new Date().toISOString()
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('[Supabase] Failed to update skin:', error);
      return { success: false, error: 'Failed to update skin' };
    }

    console.log('[Supabase] Skin updated successfully');
    return { success: true };
  } catch (error) {
    console.error('[Supabase] Error updating skin:', error);
    return { success: false, error: 'An error occurred while updating skin' };
  }
}
