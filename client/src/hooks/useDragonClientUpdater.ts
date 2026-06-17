import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';

interface UpdateStatus {
  checking: boolean;
  available: boolean;
  currentVersion?: string;
  latestVersion?: string;
  updating: boolean;
  error?: string;
}

export function useDragonClientUpdater(minecraftVersion: string, instancePath: string) {
  const [status, setStatus] = useState<UpdateStatus>({
    checking: false,
    available: false,
    updating: false,
  });

  const checkForUpdates = async () => {
    if (!minecraftVersion || !instancePath) return;

    setStatus(prev => ({ ...prev, checking: true, error: undefined }));

    try {
      const latestVersion = await invoke<string | null>('check_dragon_client_update', {
        minecraftVersion,
      });

      if (latestVersion) {
        setStatus(prev => ({
          ...prev,
          checking: false,
          available: true,
          latestVersion,
        }));
      } else {
        setStatus(prev => ({
          ...prev,
          checking: false,
          available: false,
        }));
      }
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        checking: false,
        error: error as string,
      }));
    }
  };

  const updateDragonClient = async () => {
    if (!minecraftVersion || !instancePath) return;

    setStatus(prev => ({ ...prev, updating: true, error: undefined }));

    try {
      const result = await invoke<string>('update_dragon_client_command', {
        minecraftVersion,
        instancePath,
      });

      console.log('[Dragon Client] Update result:', result);

      setStatus(prev => ({
        ...prev,
        updating: false,
        available: false,
        currentVersion: prev.latestVersion,
      }));

      return result;
    } catch (error) {
      setStatus(prev => ({
        ...prev,
        updating: false,
        error: error as string,
      }));
      throw error;
    }
  };

  // Auto-check on mount and when version/path changes
  useEffect(() => {
    checkForUpdates();
  }, [minecraftVersion, instancePath]);

  return {
    status,
    checkForUpdates,
    updateDragonClient,
  };
}
