import { useEffect, useState } from 'react';

export default function SplashScreen() {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full flex items-center justify-center bg-black">
      <div className="text-center">
        {/* Dragon Logo/Banner */}
        <div className="mb-8">
          <img 
            src="/dragon-banner.png" 
            alt="Dragon Client" 
            className="w-[600px] h-auto mx-auto"
            onError={(e) => {
              // Fallback to text if image not found
              e.currentTarget.style.display = 'none';
              const fallback = document.getElementById('fallback-text');
              if (fallback) fallback.style.display = 'block';
            }}
          />
          <div id="fallback-text" style={{ display: 'none' }}>
            <h1 className="text-6xl font-bold text-white mb-4">
              Dragon Client
            </h1>
          </div>
        </div>

        {/* Loading Text */}
        <div className="text-white text-xl font-medium">
          Starting Minecraft{dots}
        </div>

        {/* Loading Bar */}
        <div className="mt-6 w-64 h-1 bg-zinc-800 rounded-full mx-auto overflow-hidden">
          <div className="h-full bg-gradient-to-r from-pink-500 to-purple-500 animate-pulse" 
               style={{ width: '100%' }} />
        </div>
      </div>
    </div>
  );
}
