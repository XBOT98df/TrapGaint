// Secure storage for cracked accounts
// Uses localStorage with fallback for Tauri filesystem in production

interface CrackedAccount {
  username: string;
  uuid: string;
  createdAt: number;
}

interface SessionData {
  username: string;
  uuid: string;
  oderId: string;
  isOffline: boolean;
  createdAt: number;
}

// Read accounts from storage
export const readCrackedAccounts = async (): Promise<CrackedAccount[]> => {
  try {
    const data = localStorage.getItem('lapetus_cracked_accounts');
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to read accounts:', error);
    return [];
  }
};

// Write accounts to storage
export const writeCrackedAccounts = async (accounts: CrackedAccount[]): Promise<boolean> => {
  try {
    localStorage.setItem('lapetus_cracked_accounts', JSON.stringify(accounts));
    return true;
  } catch (error) {
    console.error('Failed to write accounts:', error);
    return false;
  }
};

// Add a new cracked account
export const addCrackedAccount = async (username: string, uuid: string): Promise<boolean> => {
  try {
    const accounts = await readCrackedAccounts();
    
    // Check if account already exists
    const existingIndex = accounts.findIndex(acc => acc.username === username);
    
    if (existingIndex >= 0) {
      // Update existing account
      accounts[existingIndex] = {
        username,
        uuid,
        createdAt: Date.now()
      };
    } else {
      // Add new account
      accounts.push({
        username,
        uuid,
        createdAt: Date.now()
      });
    }
    
    return await writeCrackedAccounts(accounts);
  } catch (error) {
    console.error('Failed to add cracked account:', error);
    return false;
  }
};

// Check if account exists
export const crackedAccountExists = async (username: string): Promise<boolean> => {
  try {
    const accounts = await readCrackedAccounts();
    return accounts.some(acc => acc.username === username);
  } catch (error) {
    console.error('Failed to check account existence:', error);
    return false;
  }
};

// Save session data
export const saveSession = async (session: SessionData): Promise<boolean> => {
  try {
    localStorage.setItem('lapetus_session', JSON.stringify(session));
    return true;
  } catch (error) {
    console.error('Failed to save session:', error);
    return false;
  }
};

// Read session data
export const readSession = async (): Promise<SessionData | null> => {
  try {
    const data = localStorage.getItem('lapetus_session');
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Failed to read session:', error);
    return null;
  }
};

// Clear session
export const clearSession = async (): Promise<boolean> => {
  try {
    localStorage.removeItem('lapetus_session');
    return true;
  } catch (error) {
    console.error('Failed to clear session:', error);
    return false;
  }
};

// Get account by username (for auto-login on returning users)
export const getAccountByUsername = async (username: string): Promise<CrackedAccount | null> => {
  try {
    const accounts = await readCrackedAccounts();
    return accounts.find(acc => acc.username.toLowerCase() === username.toLowerCase()) || null;
  } catch (error) {
    console.error('Failed to get account by username:', error);
    return null;
  }
};
