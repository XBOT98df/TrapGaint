import { useState, useEffect } from 'react';

export type PerformanceMode = 'high' | 'low';

export function usePerformanceMode() {
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('lapetus_performance_mode') as PerformanceMode) || 'high';
    }
    return 'high';
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const mode = localStorage.getItem('lapetus_performance_mode') as PerformanceMode;
      if (mode) setPerformanceMode(mode);
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const isLowEnd = performanceMode === 'low';
  const isHighEnd = performanceMode === 'high';

  return { performanceMode, isLowEnd, isHighEnd, setPerformanceMode };
}
