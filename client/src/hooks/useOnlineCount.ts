import { useState, useEffect } from "react";

const API_URL = "https://lapetus-cosmetics-api-production.up.railway.app";

interface OnlineData {
  online: number;
  timestamp: number;
}

export function useOnlineCount() {
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOnlineCount = async () => {
      try {
        const response = await fetch(`${API_URL}/api/online/count`);
        if (response.ok) {
          const data: OnlineData = await response.json();
          setOnlineCount(data.online);
          setError(null);
        }
      } catch (err) {
        console.error("Failed to fetch online count:", err);
        setError("Failed to fetch");
      } finally {
        setLoading(false);
      }
    };

    // Fetch immediately
    fetchOnlineCount();

    // Then fetch every 30 seconds
    const interval = setInterval(fetchOnlineCount, 30000);

    return () => clearInterval(interval);
  }, []);

  return { onlineCount, loading, error };
}

// Send heartbeat to mark user as online
export function useHeartbeat(uuid: string | null, username: string | null) {
  useEffect(() => {
    if (!uuid || !username) return;

    const sendHeartbeat = async () => {
      try {
        await fetch(`${API_URL}/api/online/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uuid, username }),
        });
      } catch (err) {
        console.error("Heartbeat failed:", err);
      }
    };

    // Send heartbeat immediately
    sendHeartbeat();

    // Then every 60 seconds
    const interval = setInterval(sendHeartbeat, 60000);

    // Send offline when unmounting
    return () => {
      clearInterval(interval);
      fetch(`${API_URL}/api/online/offline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid }),
      }).catch(() => {});
    };
  }, [uuid, username]);
}
