import { useState, useCallback } from 'react';
import { DynamicIslandState } from '@/components/DynamicIsland';

export function useDynamicIsland() {
  const [states, setStates] = useState<DynamicIslandState[]>([]);

  const addState = useCallback((state: Omit<DynamicIslandState, 'id'>) => {
    const id = `island-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newState: DynamicIslandState = {
      ...state,
      id,
      duration: state.duration ?? 5000, // Default 5 seconds
    };

    setStates(prev => [newState, ...prev.slice(0, 4)]); // Keep max 5 states
    return id;
  }, []);

  const updateState = useCallback((id: string, updates: Partial<DynamicIslandState>) => {
    setStates(prev => prev.map(state => 
      state.id === id ? { ...state, ...updates } : state
    ));
  }, []);

  const removeState = useCallback((id: string) => {
    setStates(prev => prev.filter(state => state.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setStates([]);
  }, []);

  // Convenience methods for common use cases
  const showDownload = useCallback((title: string, progress?: number) => {
    return addState({
      type: 'download',
      title,
      progress,
      color: 'default',
      persistent: progress !== undefined,
    });
  }, [addState]);

  const showLaunch = useCallback((title: string, subtitle?: string, icon?: React.ReactNode) => {
    return addState({
      type: 'launch',
      title,
      subtitle,
      icon,
      color: 'success',
      duration: 8000, // Increased to 8 seconds for longer visibility
    });
  }, [addState]);

  const showNotification = useCallback((title: string, subtitle?: string, color: DynamicIslandState['color'] = 'default') => {
    return addState({
      type: 'notification',
      title,
      subtitle,
      color,
      duration: 4000,
    });
  }, [addState]);

  const showError = useCallback((title: string, subtitle?: string) => {
    return addState({
      type: 'notification',
      title,
      subtitle,
      color: 'error',
      duration: 6000,
    });
  }, [addState]);

  const showSuccess = useCallback((title: string, subtitle?: string) => {
    return addState({
      type: 'notification',
      title,
      subtitle,
      color: 'success',
      duration: 3000,
    });
  }, [addState]);

  return {
    states,
    addState,
    updateState,
    removeState,
    clearAll,
    // Convenience methods
    showDownload,
    showLaunch,
    showNotification,
    showError,
    showSuccess,
  };
}