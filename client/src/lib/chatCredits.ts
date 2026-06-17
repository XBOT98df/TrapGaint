// Chat Credits Management System with Supabase Sync

const CREDITS_STORAGE_KEY = 'lapetus_chat_credits';
const INITIAL_CREDITS = 100;
const TOKENS_PER_CREDIT = 200; // 200 tokens = 1 credit

const SUPABASE_URL = "https://oafrooyagtdnzqtdqxtr.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9hZnJvb3lhZ3RkbnpxdGRxeHRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDc4NDYsImV4cCI6MjA4NzIyMzg0Nn0.6ujY-6Iuyha7VCNh-Xh8Lu0M_-x0FJGk61duJM84r14";

export interface CreditInfo {
  credits: number;
  lastUpdated: number;
}

// Calculate credits from tokens
export function calculateCreditsFromTokens(tokens: number): number {
  return tokens / TOKENS_PER_CREDIT;
}

// Fetch credits from Supabase
export async function fetchCreditsFromSupabase(): Promise<number> {
  try {
    const oderId = localStorage.getItem('lapetus_oder_id');
    console.log('[Credits] Fetching credits for oder_id:', oderId);
    
    if (!oderId) {
      console.warn('[Credits] No oder_id found, initializing local credits');
      initializeCredits();
      return INITIAL_CREDITS;
    }

    const url = `${SUPABASE_URL}/rest/v1/users?oder_id=eq.${oderId}&select=chat_credits`;
    console.log('[Credits] Fetching from URL:', url);
    
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      }
    });

    console.log('[Credits] Response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('[Credits] Response data:', data);
      
      if (data && data.length > 0) {
        const credits = data[0].chat_credits ?? INITIAL_CREDITS;
        console.log('[Credits] ✓ Fetched from Supabase:', credits);
        
        // Update local storage with Supabase value
        const creditInfo: CreditInfo = {
          credits,
          lastUpdated: Date.now()
        };
        localStorage.setItem(CREDITS_STORAGE_KEY, JSON.stringify(creditInfo));
        
        return credits;
      } else {
        // User exists in Supabase but no credits data, initialize
        console.log('[Credits] User found but no credits data, initializing to', INITIAL_CREDITS);
        await updateCreditsInSupabase(INITIAL_CREDITS);
        initializeCredits();
        return INITIAL_CREDITS;
      }
    }
    
    // Fallback to local storage
    console.warn('[Credits] Failed to fetch from Supabase (status:', response.status, '), using local storage');
    const localCredits = getCredits();
    return localCredits || INITIAL_CREDITS;
  } catch (error) {
    console.error('[Credits] Error fetching from Supabase:', error);
    const localCredits = getCredits();
    return localCredits || INITIAL_CREDITS;
  }
}

// Update credits in Supabase
async function updateCreditsInSupabase(credits: number): Promise<boolean> {
  try {
    const oderId = localStorage.getItem('lapetus_oder_id');
    console.log('[Credits] Updating credits in Supabase for oder_id:', oderId, 'to:', credits);
    
    if (!oderId) {
      console.warn('[Credits] No oder_id found, skipping Supabase sync');
      return false;
    }

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/users?oder_id=eq.${oderId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chat_credits: credits })
      }
    );

    console.log('[Credits] Update response status:', response.status);
    
    if (response.ok) {
      console.log('[Credits] ✓ Updated in Supabase:', credits);
      return true;
    } else {
      const errorText = await response.text();
      console.error('[Credits] Failed to update in Supabase:', errorText);
      return false;
    }
  } catch (error) {
    console.error('[Credits] Error updating Supabase:', error);
    return false;
  }
}

// Initialize credits for new users
export function initializeCredits(): void {
  const existing = localStorage.getItem(CREDITS_STORAGE_KEY);
  if (!existing) {
    const creditInfo: CreditInfo = {
      credits: INITIAL_CREDITS,
      lastUpdated: Date.now()
    };
    localStorage.setItem(CREDITS_STORAGE_KEY, JSON.stringify(creditInfo));
    console.log('[Credits] Initialized with', INITIAL_CREDITS, 'credits');
  }
}

// Get current credits (from local storage)
export function getCredits(): number {
  try {
    const data = localStorage.getItem(CREDITS_STORAGE_KEY);
    if (!data) {
      initializeCredits();
      return INITIAL_CREDITS;
    }
    const creditInfo: CreditInfo = JSON.parse(data);
    return creditInfo.credits;
  } catch (error) {
    console.error('[Credits] Error reading credits:', error);
    return 0;
  }
}

// Deduct credits based on tokens used (syncs with Supabase)
export async function deductCreditsFromTokens(tokens: number): Promise<boolean> {
  try {
    const creditsToDeduct = calculateCreditsFromTokens(tokens);
    const currentCredits = getCredits();
    
    if (currentCredits < creditsToDeduct) {
      console.warn('[Credits] Insufficient credits. Have:', currentCredits, 'Need:', creditsToDeduct);
      return false;
    }
    
    const newCredits = Math.max(0, currentCredits - creditsToDeduct);
    const creditInfo: CreditInfo = {
      credits: newCredits,
      lastUpdated: Date.now()
    };
    
    // Update local storage
    localStorage.setItem(CREDITS_STORAGE_KEY, JSON.stringify(creditInfo));
    console.log('[Credits] Deducted', creditsToDeduct.toFixed(2), 'credits (', tokens, 'tokens). Remaining:', newCredits.toFixed(2));
    
    // Sync with Supabase
    await updateCreditsInSupabase(newCredits);
    
    return true;
  } catch (error) {
    console.error('[Credits] Error deducting credits:', error);
    return false;
  }
}

// Legacy function - kept for compatibility
export async function deductCredits(amount: number = 1): Promise<boolean> {
  return deductCreditsFromTokens(amount * TOKENS_PER_CREDIT);
}

// Add credits (for admin/testing purposes)
export async function addCredits(amount: number): Promise<void> {
  try {
    const currentCredits = getCredits();
    const newCredits = currentCredits + amount;
    
    const creditInfo: CreditInfo = {
      credits: newCredits,
      lastUpdated: Date.now()
    };
    
    localStorage.setItem(CREDITS_STORAGE_KEY, JSON.stringify(creditInfo));
    console.log('[Credits] Added', amount, 'credits. New total:', newCredits);
    
    // Sync with Supabase
    await updateCreditsInSupabase(newCredits);
  } catch (error) {
    console.error('[Credits] Error adding credits:', error);
  }
}

// Check if user has enough credits for estimated tokens
export function hasEnoughCreditsForTokens(estimatedTokens: number): boolean {
  const creditsNeeded = calculateCreditsFromTokens(estimatedTokens);
  return getCredits() >= creditsNeeded;
}

// Legacy function - kept for compatibility
export function hasEnoughCredits(amount: number = 1): boolean {
  return getCredits() >= amount;
}

// Reset credits (for testing)
export async function resetCredits(): Promise<void> {
  const creditInfo: CreditInfo = {
    credits: INITIAL_CREDITS,
    lastUpdated: Date.now()
  };
  localStorage.setItem(CREDITS_STORAGE_KEY, JSON.stringify(creditInfo));
  console.log('[Credits] Reset to', INITIAL_CREDITS, 'credits');
  
  // Sync with Supabase
  await updateCreditsInSupabase(INITIAL_CREDITS);
}
