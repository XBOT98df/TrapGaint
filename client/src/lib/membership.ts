// Membership tier system utilities

export type TierName = 'SIEFRA' | 'SIOET' | 'LEKIA';

export interface MembershipTier {
  name: TierName;
  level: number;
  color: string;
  logo: string;
  displayName: string;
}

export const TIERS: Record<TierName, MembershipTier> = {
  SIEFRA: {
    name: 'SIEFRA',
    level: 1,
    color: '#ec4899', // Pink (Default)
    logo: '/SIEFRA.png',
    displayName: 'SIEFRA Rank'
  },
  SIOET: {
    name: 'SIOET',
    level: 2,
    color: '#ef4444', // Red (Premium)
    logo: '/SIOET.png',
    displayName: 'SIOET Rank'
  },
  LEKIA: {
    name: 'LEKIA',
    level: 3,
    color: '#a855f7', // Purple (Elite)
    logo: '/LEKIA.png',
    displayName: 'LEKIA Rank'
  }
};

export function getTierByName(name: TierName): MembershipTier {
  return TIERS[name] || TIERS.SIEFRA;
}

export function applyTierTheme(tier: MembershipTier) {
  // Update CSS variables based on tier
  const root = document.documentElement;
  
  console.log('Applying tier theme:', tier.name, tier.color);
  
  // Remove any existing inline styles first
  root.style.removeProperty('--primary');
  root.style.removeProperty('--ring');
  root.style.removeProperty('--sidebar-primary');
  root.style.removeProperty('--sidebar-ring');
  
  // Force a reflow
  void root.offsetHeight;
  
  if (tier.name === 'LEKIA') {
    // Purple theme for LEKIA
    root.style.setProperty('--primary', '270 91% 65%', 'important'); // Purple #a855f7
    root.style.setProperty('--ring', '270 91% 65%', 'important');
    root.style.setProperty('--sidebar-primary', '270 91% 65%', 'important');
    root.style.setProperty('--sidebar-ring', '270 91% 65%', 'important');
    console.log('Applied LEKIA purple theme');
  } else if (tier.name === 'SIOET') {
    // Red theme for SIOET
    root.style.setProperty('--primary', '0 84% 60%', 'important'); // Red #ef4444
    root.style.setProperty('--ring', '0 84% 60%', 'important');
    root.style.setProperty('--sidebar-primary', '0 84% 60%', 'important');
    root.style.setProperty('--sidebar-ring', '0 84% 60%', 'important');
    console.log('Applied SIOET red theme');
  } else {
    // Pink theme for SIEFRA (default)
    root.style.setProperty('--primary', '330 81% 60%', 'important'); // Pink #ec4899
    root.style.setProperty('--ring', '330 81% 60%', 'important');
    root.style.setProperty('--sidebar-primary', '330 81% 60%', 'important');
    root.style.setProperty('--sidebar-ring', '330 81% 60%', 'important');
    console.log('Applied SIEFRA pink theme');
  }
  
  // Log the actual computed values
  const computedPrimary = getComputedStyle(root).getPropertyValue('--primary');
  console.log('Computed --primary value:', computedPrimary);
  
  // Force re-render by triggering a custom event
  window.dispatchEvent(new CustomEvent('themeChanged', { detail: { tier: tier.name } }));
}

export function saveTierToStorage(tier: TierName, oderId?: string, isTrial: boolean = false, expiresAt?: number) {
  // ALWAYS save tier globally as fallback
  localStorage.setItem('dragon_tier', tier);
  
  // Also save tier per user (oderId) for multi-account support
  if (oderId) {
    const userTiers = JSON.parse(localStorage.getItem('dragon_user_tiers') || '{}');
    userTiers[oderId] = {
      tier,
      isTrial,
      expiresAt: expiresAt || null,
      savedAt: Date.now()
    };
    localStorage.setItem('dragon_user_tiers', JSON.stringify(userTiers));
    console.log('[Tier] Saved tier:', tier, 'for oderId:', oderId, 'isTrial:', isTrial, 'expiresAt:', expiresAt ? new Date(expiresAt).toISOString() : 'never');
    
    // ALSO save as last known tier for this user (for quick restore)
    localStorage.setItem(`dragon_tier_${oderId}`, tier);
  } else {
    console.log('[Tier] Saved global tier:', tier);
  }
}

export function getTierFromStorage(oderId?: string): TierName {
  console.log('[Tier] getTierFromStorage called with oderId:', oderId);
  
  // If oderId provided, try to get user-specific tier first
  if (oderId) {
    // Try quick restore first
    const quickTier = localStorage.getItem(`dragon_tier_${oderId}`);
    if (quickTier) {
      console.log('[Tier] Quick restore tier:', quickTier, 'for oderId:', oderId);
    }
    
    const userTiers = JSON.parse(localStorage.getItem('dragon_user_tiers') || '{}');
    const userTierData = userTiers[oderId];
    
    if (userTierData) {
      // Handle old format (string) or new format (object)
      if (typeof userTierData === 'string') {
        console.log('[Tier] Found user-specific tier (old format):', userTierData, 'for oderId:', oderId);
        return userTierData as TierName;
      }
      
      // Check if trial has expired
      if (userTierData.isTrial && userTierData.expiresAt) {
        const now = Date.now();
        if (now > userTierData.expiresAt) {
          console.log('[Tier] Trial expired for oderId:', oderId, '- reverting to SIEFRA');
          // Revert to default tier
          saveTierToStorage('SIEFRA', oderId, false);
          return 'SIEFRA';
        }
        
        const hoursLeft = Math.ceil((userTierData.expiresAt - now) / (1000 * 60 * 60));
        console.log('[Tier] Trial active for oderId:', oderId, '- expires in', hoursLeft, 'hours');
      }
      
      console.log('[Tier] Found user-specific tier:', userTierData.tier, 'for oderId:', oderId);
      return userTierData.tier as TierName;
    }
    
    // Try quick restore as fallback
    if (quickTier && ['SIEFRA', 'SIOET', 'LEKIA'].includes(quickTier)) {
      console.log('[Tier] Using quick restore tier:', quickTier);
      return quickTier as TierName;
    }
  }
  
  // Fall back to global tier
  const stored = localStorage.getItem('dragon_tier');
  const tier = (stored as TierName) || 'SIEFRA';
  console.log('[Tier] Using global tier:', tier);
  return tier;
}

// Supabase configuration
const SUPABASE_URL = "https://oafrooyagtdnzqtdqxtr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZnJvb3lhZ3RkbnpxdGRxeHRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDc4NDYsImV4cCI6MjA4NzIyMzg0Nn0.6ujY-6Iuyha7VCNh-Xh8Lu0M_-x0FJGk61duJM84r14";

// Trial code configuration
interface TrialCodeConfig {
  tier: TierName;
  isTrial: boolean;
  durationHours?: number;
}

// Demo codes for testing (these work without database)
const DEMO_CODES: Record<string, TrialCodeConfig> = {
  // 24-HOUR TRIAL CODES - Anyone can use these!
  'DRAGON-TRIAL-24H': { tier: 'LEKIA', isTrial: true, durationHours: 24 },
  'TRY-DRAGON-FREE': { tier: 'LEKIA', isTrial: true, durationHours: 24 },
  'FREE-TRIAL-2025': { tier: 'LEKIA', isTrial: true, durationHours: 24 },
  'TEST-DRAGON-NOW': { tier: 'SIOET', isTrial: true, durationHours: 24 },
  'DRAGON-DEMO-24H': { tier: 'SIOET', isTrial: true, durationHours: 24 },
  
  // Premium (SIOET - Red) codes - PERMANENT
  'GREATMIGHTYDRAGON': { tier: 'SIOET', isTrial: false },
  'SIOET-DEMO-2025': { tier: 'SIOET', isTrial: false },
  'DRAGON-PREMIUM': { tier: 'SIOET', isTrial: false },
  'RED-RANK-2025': { tier: 'SIOET', isTrial: false },
  'PREMIUM-ACCESS': { tier: 'SIOET', isTrial: false },
  'SIOET-VIP-001': { tier: 'SIOET', isTrial: false },
  'SIOET-VIP-002': { tier: 'SIOET', isTrial: false },
  'SIOET-VIP-003': { tier: 'SIOET', isTrial: false },
  'SIOET-TEST-001': { tier: 'SIOET', isTrial: false },
  'SIOET-TEST-002': { tier: 'SIOET', isTrial: false },
  'SIOET-TEST-003': { tier: 'SIOET', isTrial: false },
  
  // Elite (LEKIA - Purple) codes - PERMANENT
  'LEKIA-DEMO-2025': { tier: 'LEKIA', isTrial: false },
  'DRAGON-ELITE': { tier: 'LEKIA', isTrial: false },
  'PURPLE-RANK-2025': { tier: 'LEKIA', isTrial: false },
  'ELITE-ACCESS': { tier: 'LEKIA', isTrial: false },
  'LEKIA-VIP-001': { tier: 'LEKIA', isTrial: false },
  'LEKIA-VIP-002': { tier: 'LEKIA', isTrial: false },
  'LEKIA-VIP-003': { tier: 'LEKIA', isTrial: false },
  'LEKIA-TEST-001': { tier: 'LEKIA', isTrial: false },
  'LEKIA-TEST-002': { tier: 'LEKIA', isTrial: false },
  'LEKIA-TEST-003': { tier: 'LEKIA', isTrial: false },
  
  // Special event codes - PERMANENT
  'NEWYEAR-2025': { tier: 'LEKIA', isTrial: false },
  'LAUNCH-SPECIAL': { tier: 'SIOET', isTrial: false },
  'BETA-TESTER': { tier: 'LEKIA', isTrial: false },
  'EARLY-ACCESS': { tier: 'SIOET', isTrial: false },
  'FOUNDER-PACK': { tier: 'LEKIA', isTrial: false },
  
  // Streamer/Creator codes - PERMANENT
  'STREAMER-001': { tier: 'SIOET', isTrial: false },
  'STREAMER-002': { tier: 'SIOET', isTrial: false },
  'CREATOR-001': { tier: 'LEKIA', isTrial: false },
  'CREATOR-002': { tier: 'LEKIA', isTrial: false },
  'INFLUENCER-001': { tier: 'LEKIA', isTrial: false },
};

export async function redeemCode(code: string, oderId: string): Promise<{ success: boolean; tier?: TierName; error?: string; isTrial?: boolean; expiresAt?: number }> {
  try {
    // Check demo codes first
    const demoCodeConfig = DEMO_CODES[code.toUpperCase()];
    if (demoCodeConfig) {
      // Check if already used (only for non-trial codes)
      const usedCodes = JSON.parse(localStorage.getItem('dragon_used_codes') || '{}');
      if (!demoCodeConfig.isTrial && usedCodes[code.toUpperCase()]) {
        return { success: false, error: 'Code already used' };
      }

      // Calculate expiration for trial codes
      let expiresAt: number | undefined;
      if (demoCodeConfig.isTrial && demoCodeConfig.durationHours) {
        expiresAt = Date.now() + (demoCodeConfig.durationHours * 60 * 60 * 1000);
      }

      // Mark as used (for non-trial codes)
      if (!demoCodeConfig.isTrial) {
        usedCodes[code.toUpperCase()] = {
          usedAt: new Date().toISOString(),
          oderId: oderId
        };
        localStorage.setItem('dragon_used_codes', JSON.stringify(usedCodes));
      }

      return { 
        success: true, 
        tier: demoCodeConfig.tier,
        isTrial: demoCodeConfig.isTrial,
        expiresAt
      };
    }

    // Check if code exists and is unused in database
    const codeResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/redeem_codes?code=eq.${code}&is_used=eq.false&select=*`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        }
      }
    );

    if (!codeResponse.ok) {
      return { success: false, error: 'Failed to validate code' };
    }

    const codes = await codeResponse.json();
    
    if (codes.length === 0) {
      return { success: false, error: 'Invalid or already used code' };
    }

    const redeemCode = codes[0];

    // Check if code is expired
    if (redeemCode.expires_at && new Date(redeemCode.expires_at) < new Date()) {
      return { success: false, error: 'Code has expired' };
    }

    // Get tier info
    const tierResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/membership_tiers?id=eq.${redeemCode.tier_id}&select=*`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        }
      }
    );

    const tiers = await tierResponse.json();
    if (tiers.length === 0) {
      return { success: false, error: 'Invalid tier' };
    }

    const tier = tiers[0];

    // Mark code as used
    await fetch(`${SUPABASE_URL}/rest/v1/redeem_codes?id=eq.${redeemCode.id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        is_used: true,
        used_by_oder_id: oderId,
        used_at: new Date().toISOString()
      })
    });

    // Update user membership
    await fetch(`${SUPABASE_URL}/rest/v1/user_memberships`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        oder_id: oderId,
        tier_id: tier.id,
        redeemed_code: code,
        activated_at: new Date().toISOString()
      })
    });

    // Update user tier
    await fetch(`${SUPABASE_URL}/rest/v1/users?oder_id=eq.${oderId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        current_tier: tier.tier_name,
        tier_color: tier.theme_color
      })
    });

    return { success: true, tier: tier.tier_name as TierName };
  } catch (error) {
    console.error('Error redeeming code:', error);
    return { success: false, error: 'Failed to redeem code' };
  }
}

export async function getUserTier(oderId: string): Promise<TierName> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users?oder_id=eq.${oderId}&select=current_tier`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        }
      }
    );

    if (response.ok) {
      const users = await response.json();
      if (users.length > 0 && users[0].current_tier) {
        return users[0].current_tier as TierName;
      }
    }
  } catch (error) {
    console.error('Error fetching user tier:', error);
  }

  return 'SIEFRA'; // Default tier
}

// Helper function to clear used codes (for testing)
export function clearUsedCodes() {
  localStorage.removeItem('dragon_used_codes');
  console.log('Cleared all used codes');
}

// Helper function to reset tier to default (for testing)
export function resetTier() {
  localStorage.removeItem('dragon_tier');
  const defaultTier = getTierByName('SIEFRA');
  applyTierTheme(defaultTier);
  console.log('Reset to default SIEFRA tier');
}

// Helper function to get trial info for current user
export function getTrialInfo(oderId?: string): { isTrial: boolean; hoursLeft?: number; expiresAt?: number } | null {
  if (!oderId) return null;
  
  const userTiers = JSON.parse(localStorage.getItem('dragon_user_tiers') || '{}');
  const userTierData = userTiers[oderId];
  
  if (!userTierData || typeof userTierData === 'string') return null;
  
  if (userTierData.isTrial && userTierData.expiresAt) {
    const now = Date.now();
    const hoursLeft = Math.max(0, Math.ceil((userTierData.expiresAt - now) / (1000 * 60 * 60)));
    
    return {
      isTrial: true,
      hoursLeft,
      expiresAt: userTierData.expiresAt
    };
  }
  
  return { isTrial: false };
}

// Make these available globally for testing in console
if (typeof window !== 'undefined') {
  (window as any).clearUsedCodes = clearUsedCodes;
  (window as any).resetTier = resetTier;
  (window as any).applyTierTheme = applyTierTheme;
  (window as any).getTierByName = getTierByName;
  (window as any).getTrialInfo = getTrialInfo;
}
