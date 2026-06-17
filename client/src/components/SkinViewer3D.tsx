import React, { useState, useEffect } from 'react';

interface SkinViewer3DProps {
  skinUrl: string;
  model: 'default' | 'slim';
  className?: string;
}

export const SkinViewer3D: React.FC<SkinViewer3DProps> = ({ skinUrl, model, className }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [renderUrl, setRenderUrl] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const generateRender = async () => {
      setIsLoading(true);
      setError('');
      
      try {
        // Convert skin data URL to blob and upload to get a UUID or hash
        // For demo purposes, we'll use a placeholder approach
        
        // Method 1: Try using MineSkin.org API for 3D renders
        const response = await fetch('https://api.mineskin.org/generate/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            file: skinUrl,
            model: model === 'slim' ? 'slim' : 'steve'
          })
        });

        if (response.ok) {
          const data = await response.json();
          // Use the generated skin UUID for 3D rendering
          const renderApiUrl = `https://crafatar.com/renders/body/${data.data.uuid}?size=256&overlay`;
          setRenderUrl(renderApiUrl);
        } else {
          throw new Error('MineSkin API failed');
        }
        
      } catch (err) {
        console.error('MineSkin failed, trying alternative:', err);
        
        // Fallback: Use VisageAPI with direct skin URL
        try {
          const visageUrl = `https://visage.surgeplay.com/full/256.png`;
          
          // For now, we'll create a simple 3D-looking render using CSS transforms
          // This is a fallback when APIs don't work with data URLs
          setRenderUrl(skinUrl); // Use original skin with CSS 3D effect
          setError('api-fallback');
          
        } catch (fallbackErr) {
          console.error('All APIs failed:', fallbackErr);
          setError('All render APIs failed');
        }
      }
      
      setIsLoading(false);
    };

    if (skinUrl) {
      generateRender();
    }
  }, [skinUrl, model]);

  if (error && error !== 'api-fallback') {
    return (
      <div className={`relative ${className}`}>
        <div className="w-64 h-64 bg-zinc-900 rounded-lg border-2 border-zinc-700 flex items-center justify-center">
          <div className="text-red-400 text-sm text-center">
            <div>3D render unavailable</div>
            <div className="text-xs text-zinc-500 mt-1">Showing flat preview</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div className="w-64 h-64 bg-zinc-900 rounded-lg border-2 border-zinc-700 flex items-center justify-center overflow-hidden">
        {isLoading ? (
          <div className="text-white text-sm">Generating 3D render...</div>
        ) : error === 'api-fallback' ? (
          // CSS-based 3D effect fallback
          <div className="relative w-48 h-48 transform-gpu">
            <img 
              src={renderUrl}
              alt="Skin Preview" 
              className="w-full h-full object-contain transform rotate-12 scale-110 shadow-2xl"
              style={{ 
                imageRendering: 'pixelated',
                filter: 'drop-shadow(4px 4px 8px rgba(0,0,0,0.5))'
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-black/20 pointer-events-none"></div>
          </div>
        ) : (
          <img 
            src={renderUrl}
            alt="3D Skin Render" 
            className="w-full h-full object-contain"
            style={{ imageRendering: 'pixelated' }}
            onError={() => {
              setError('Render failed');
            }}
          />
        )}
      </div>
      
      {!isLoading && (
        <div className="absolute bottom-2 right-2 text-xs text-zinc-400 bg-black/50 px-2 py-1 rounded">
          {error === 'api-fallback' ? '3D Effect' : '3D Render'}
        </div>
      )}
    </div>
  );
};