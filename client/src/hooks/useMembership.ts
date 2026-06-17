import { useState, useEffect } from 'react';
import { getTierByName, getUserTier, applyTierTheme, getTierFromStorage, saveTierToStorage, type TierName, type MembershipTier } from '@/lib/membership';

export function useMembership(oderId: string | null) {
  const [tier, setTier] = useState<MembershipTier>(() => {
    // Initialize with stored tier for this user
    const storedTierName = getTierFromStorage(oderId || undefined);
    return getTierByName(storedTierName);
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadTier = async () => {
      if (!oderId) {
        // Use stored tier or default (check for trial expiration)
        const storedTier = getTierFromStorage();
        const tierData = getTierByName(storedTier);
        setTier(tierData);
        applyTierTheme(tierData);
        setIsLoading(false);
        return;
      }

      // Check stored tier first (this will handle trial expiration)
      const storedTier = getTierFromStorage(oderId);
      const tierData = getTierByName(storedTier);
      setTier(tierData);
      applyTierTheme(tierData);

      try {
        // Fetch from server in background
        const tierName = await getUserTier(oderId);
        const serverTierData = getTierByName(tierName);
        
        // Only update if server tier is different and not expired trial
        if (tierName !== storedTier) {
          setTier(serverTierData);
          applyTierTheme(serverTierData);
          saveTierToStorage(tierName, oderId, false);
        }
      } catch (error) {
        console.error('Error loading tier from server:', error);
        // Already using stored tier, no need to change
      } finally {
        setIsLoading(false);
      }
    };

    loadTier();
  }, [oderId]);

  const updateTier = (newTierName: TierName, isTrial: boolean = false, expiresAt?: number) => {
    const newTier = getTierByName(newTierName);
    setTier(newTier);
    applyTierTheme(newTier);
    saveTierToStorage(newTierName, oderId || undefined, isTrial, expiresAt);
  };

  return {
    tier,
    isLoading,
    updateTier
  };
}
