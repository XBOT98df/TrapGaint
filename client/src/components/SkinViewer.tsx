import React, { useEffect, useRef, useState } from 'react';

interface SkinViewerProps {
  skinUrl?: string;
  model?: string;
  className?: string;
  width?: number;
  height?: number;
}

export const SkinViewer: React.FC<SkinViewerProps> = ({ 
  skinUrl, 
  model = 'default',
  className = '', 
  width = 250, 
  height = 320 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const initViewer = async () => {
      if (!canvasRef.current || !mounted) return;

      try {
        // Clean up previous viewer
        if (viewerRef.current) {
          try {
            viewerRef.current.dispose();
          } catch (e) {
            console.warn('Error disposing previous viewer:', e);
          }
          viewerRef.current = null;
        }

        // Dynamically import to avoid SSR issues
        const { default: MinecraftSkinViewer } = await import('minecraft-skin-viewer');

        if (!mounted) return;

        // Create new viewer with custom skin or mannequin fallback
        viewerRef.current = new MinecraftSkinViewer({
          canvas: canvasRef.current,
          skin: skinUrl || '/mannequin.png', // Use uploaded skin or mannequin fallback
          cape: null, // No cape for skin viewer
          dinnerbone: false,
          glint: false
        });

        if (viewerRef.current.renderer) {
          // Keep preview transparent while textures are applying to avoid black flash.
          viewerRef.current.renderer.setClearColor(0x000000, 0);
        }

        // Configure camera for 3D tilted view (front-left angle)
        if (viewerRef.current.camera && viewerRef.current.controls) {
          // Position camera at front-left angle for 3D look
          viewerRef.current.camera.position.set(-25, 8, 30);
          viewerRef.current.camera.lookAt(0, -4, 0); // Look at player center
          
          // Disable controls to prevent user interaction
          viewerRef.current.controls.enableZoom = false;
          viewerRef.current.controls.enablePan = false;
          viewerRef.current.controls.enableRotate = false;
          viewerRef.current.controls.autoRotate = false;
          
          // Set wider field of view to prevent cutoff
          viewerRef.current.camera.fov = 50; // Wider view to show full player without cutoff
          viewerRef.current.camera.aspect = width / height;
          viewerRef.current.camera.updateProjectionMatrix();
          
          // Ensure renderer uses full canvas and proper size
          if (viewerRef.current.renderer) {
            viewerRef.current.renderer.setSize(width, height, false);
            viewerRef.current.renderer.setViewport(0, 0, width, height);
            viewerRef.current.renderer.setPixelRatio(window.devicePixelRatio || 1);
          }
        }

        // Position player in the viewport to prevent cutoff
        const positionPlayer = () => {
          if (viewerRef.current && viewerRef.current.playerObject && mounted) {
            try {
              // Keep player at default rotation for front view
              viewerRef.current.playerObject.rotation.y = 0;
              // Center player properly to show full body
              viewerRef.current.playerObject.position.set(0, -18, 0);
            } catch (e) {
              console.warn('Error positioning player:', e);
            }
          }
        };

        // Wait for viewer to be ready, then position
        setTimeout(positionPlayer, 100);

        setIsLoading(false);
        setError(false);

      } catch (err) {
        console.error('Failed to create SkinViewer:', err);
        if (mounted) {
          setError(true);
          setIsLoading(false);
        }
      }
    };

    initViewer();

    return () => {
      mounted = false;
      if (viewerRef.current) {
        try {
          viewerRef.current.dispose();
        } catch (e) {
          console.warn('Error disposing viewer on cleanup:', e);
        }
        viewerRef.current = null;
      }
    };
  }, [width, height]);

  // Update skin when skinUrl changes
  useEffect(() => {
    if (viewerRef.current && !isLoading) {
      try {
        viewerRef.current.loadSkin(skinUrl || '/mannequin.png');
        // Ensure player stays positioned correctly after skin loads
        setTimeout(() => {
          if (viewerRef.current && viewerRef.current.playerObject) {
            try {
              viewerRef.current.playerObject.rotation.y = 0; // Keep at front view
              viewerRef.current.playerObject.position.set(0, -18, 0); // Center player properly
            } catch (e) {
              console.warn('Error positioning player after skin load:', e);
            }
          }
        }, 50);
      } catch (err) {
        console.error('Failed to load skin:', err);
      }
    }
  }, [skinUrl, isLoading]);

  if (error) {
    return (
      <div 
        className={`${className} flex items-center justify-center bg-transparent rounded`}
        style={{ width: `${width}px`, height: `${height}px` }}
      >
        <span className="text-zinc-500 text-xs">Failed to load</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ 
          width: '100%', 
          height: '100%',
          imageRendering: 'pixelated',
          display: 'block',
          borderRadius: '8px',
          backgroundColor: 'transparent',
          opacity: isLoading ? 0 : 1,
          transition: 'opacity 150ms ease'
        }}
      />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg pointer-events-none">
          <span className="text-zinc-500 text-xs">Loading...</span>
        </div>
      )}
    </div>
  );
};
