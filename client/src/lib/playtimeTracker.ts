const STORAGE_KEY = 'lapetus_playtime_v1';
const SESSION_STALE_MS = 90_000;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

type DayLabel = (typeof DAY_LABELS)[number];

interface AccountPlaytimeData {
  dailySeconds: Record<string, number>;
  activeSessionStartMs?: number;
  activeSessionLastSeenMs?: number;
}

interface PlaytimeStore {
  version: 1;
  accounts: Record<string, AccountPlaytimeData>;
}

export interface WeeklyPlaytimeDay {
  label: DayLabel;
  dateKey: string;
  seconds: number;
  isToday: boolean;
}

export interface WeeklyPlaytimeStats {
  days: WeeklyPlaytimeDay[];
  totalSeconds: number;
  isLive: boolean;
}

const createEmptyStore = (): PlaytimeStore => ({
  version: 1,
  accounts: {},
});

const pad2 = (n: number): string => String(n).padStart(2, '0');

const getDateKey = (ms: number): string => {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const readStore = (): PlaytimeStore => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptyStore();
    }

    const parsed = JSON.parse(raw) as PlaytimeStore;
    if (!parsed || typeof parsed !== 'object' || !parsed.accounts) {
      return createEmptyStore();
    }

    return {
      version: 1,
      accounts: parsed.accounts,
    };
  } catch (error) {
    console.error('[Playtime] Failed to read store:', error);
    return createEmptyStore();
  }
};

const writeStore = (store: PlaytimeStore): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.error('[Playtime] Failed to write store:', error);
  }
};

const getOrCreateAccountData = (
  store: PlaytimeStore,
  accountId: string
): AccountPlaytimeData => {
  if (!store.accounts[accountId]) {
    store.accounts[accountId] = {
      dailySeconds: {},
    };
  }
  if (!store.accounts[accountId].dailySeconds) {
    store.accounts[accountId].dailySeconds = {};
  }
  return store.accounts[accountId];
};

const pruneOldHistory = (dailySeconds: Record<string, number>, nowMs: number): void => {
  const threshold = new Date(nowMs);
  threshold.setDate(threshold.getDate() - 120);
  threshold.setHours(0, 0, 0, 0);
  const thresholdKey = getDateKey(threshold.getTime());

  Object.keys(dailySeconds).forEach((key) => {
    if (key < thresholdKey) {
      delete dailySeconds[key];
    }
  });
};

const addDurationByDay = (
  target: Record<string, number>,
  startMs: number,
  endMs: number
): void => {
  if (endMs <= startMs) {
    return;
  }

  let cursor = startMs;
  while (cursor < endMs) {
    const boundary = new Date(cursor);
    boundary.setHours(24, 0, 0, 0);
    const sliceEnd = Math.min(boundary.getTime(), endMs);
    const seconds = Math.floor((sliceEnd - cursor) / 1000);
    if (seconds > 0) {
      const key = getDateKey(cursor);
      target[key] = (target[key] || 0) + seconds;
    }
    cursor = sliceEnd;
  }
};

const finalizeActiveSession = (
  accountData: AccountPlaytimeData,
  endMs: number
): void => {
  const startMs = accountData.activeSessionStartMs;
  if (!startMs) {
    return;
  }

  addDurationByDay(accountData.dailySeconds, startMs, Math.max(endMs, startMs));
  delete accountData.activeSessionStartMs;
  delete accountData.activeSessionLastSeenMs;
};

const buildEmptyWeek = (nowMs: number): WeeklyPlaytimeStats => {
  const now = new Date(nowMs);
  const todayKey = getDateKey(nowMs);
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const days: WeeklyPlaytimeDay[] = DAY_LABELS.map((label, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    const dateKey = getDateKey(day.getTime());
    return {
      label,
      dateKey,
      seconds: 0,
      isToday: dateKey === todayKey,
    };
  });

  return {
    days,
    totalSeconds: 0,
    isLive: false,
  };
};

export function startPlaytimeSession(accountId: string | null | undefined): void {
  if (!accountId) {
    return;
  }

  const now = Date.now();
  const store = readStore();
  const accountData = getOrCreateAccountData(store, accountId);

  if (accountData.activeSessionStartMs) {
    const lastSeen = accountData.activeSessionLastSeenMs || accountData.activeSessionStartMs;
    finalizeActiveSession(accountData, Math.max(lastSeen, accountData.activeSessionStartMs));
  }

  accountData.activeSessionStartMs = now;
  accountData.activeSessionLastSeenMs = now;
  pruneOldHistory(accountData.dailySeconds, now);
  writeStore(store);
}

export function touchPlaytimeSession(accountId: string | null | undefined): void {
  if (!accountId) {
    return;
  }

  const now = Date.now();
  const store = readStore();
  const accountData = getOrCreateAccountData(store, accountId);

  if (!accountData.activeSessionStartMs) {
    accountData.activeSessionStartMs = now;
  }
  accountData.activeSessionLastSeenMs = now;
  writeStore(store);
}

export function endPlaytimeSession(accountId: string | null | undefined): void {
  if (!accountId) {
    return;
  }

  const now = Date.now();
  const store = readStore();
  const accountData = store.accounts[accountId];
  if (!accountData) {
    return;
  }

  finalizeActiveSession(accountData, now);
  pruneOldHistory(accountData.dailySeconds, now);
  writeStore(store);
}

export function getWeeklyPlaytimeStats(
  accountId: string | null | undefined,
  nowMs: number = Date.now()
): WeeklyPlaytimeStats {
  const base = buildEmptyWeek(nowMs);
  if (!accountId) {
    return base;
  }

  const store = readStore();
  const accountData = store.accounts[accountId];
  if (!accountData) {
    return base;
  }

  const totals: Record<string, number> = { ...accountData.dailySeconds };
  let isLive = false;

  if (accountData.activeSessionStartMs) {
    const startMs = accountData.activeSessionStartMs;
    const lastSeenMs = Math.max(accountData.activeSessionLastSeenMs || startMs, startMs);
    const stale = nowMs - lastSeenMs > SESSION_STALE_MS;
    const effectiveEndMs = stale ? lastSeenMs : nowMs;
    if (effectiveEndMs > startMs) {
      addDurationByDay(totals, startMs, effectiveEndMs);
    }
    isLive = !stale;
  }

  const days = base.days.map((day) => {
    const seconds = totals[day.dateKey] || 0;
    return { ...day, seconds };
  });

  const totalSeconds = days.reduce((sum, day) => sum + day.seconds, 0);
  return {
    days,
    totalSeconds,
    isLive,
  };
}

export function formatPlaytimeTotal(totalSeconds: number): string {
  if (totalSeconds <= 0) {
    return '0 min';
  }

  if (totalSeconds < 3600) {
    return `${Math.max(1, Math.round(totalSeconds / 60))} min`;
  }

  return `${(totalSeconds / 3600).toFixed(1)} hours`;
}
