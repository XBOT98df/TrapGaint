import React, { useCallback, useEffect, useRef, useState } from 'react';
import { decompressFrames, parseGIF, type ParsedFrame } from 'gifuct-js';

interface CapeViewerProps {
  capeUrl?: string;
  className?: string;
  width?: number;
  height?: number;
}

type SkinViewer = any;

export const CapeViewer: React.FC<CapeViewerProps> = ({
  capeUrl,
  className = '',
  width = 100,
  height = 100
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const isGifCapeUrl = useCallback((url?: string): boolean => {
    return Boolean(url && /\.gif(?:\?.*)?$/i.test(url));
  }, []);

  const positionViewer = useCallback(() => {
    if (!viewerRef.current) {
      return;
    }

    try {
      if (viewerRef.current.camera && viewerRef.current.controls) {
        viewerRef.current.camera.position.set(-25, 0, -25);
        viewerRef.current.camera.lookAt(0, -8, 0);
        viewerRef.current.camera.fov = 40;
        viewerRef.current.camera.aspect = width / height;
        viewerRef.current.camera.updateProjectionMatrix();

        viewerRef.current.controls.enableZoom = false;
        viewerRef.current.controls.enablePan = false;
        viewerRef.current.controls.enableRotate = false;
        viewerRef.current.controls.autoRotate = false;
      }

      if (viewerRef.current.renderer) {
        viewerRef.current.renderer.setSize(width, height, false);
        viewerRef.current.renderer.setViewport(0, 0, width, height);
        viewerRef.current.renderer.setPixelRatio(window.devicePixelRatio || 1);
      }

      if (viewerRef.current.playerObject && viewerRef.current.playerObject.rotation) {
        viewerRef.current.playerObject.rotation.y = 0;
        viewerRef.current.playerObject.position.set(0, -12, 0);
      }
    } catch (error) {
      console.error('Error positioning viewer:', error);
    }
  }, [height, width]);

  const preloadCapeTexture = useCallback(async (url: string): Promise<void> => {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Failed to preload cape texture: ${url}`));
      image.src = url;
    });
  }, []);

  const waitForPaint = useCallback(async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }, []);

  const buildAnimatedCapeSpriteSheetUrl = useCallback(async (url: string): Promise<string> => {
    const CAPE_TEXTURE_WIDTH = 64;
    const CAPE_TEXTURE_HEIGHT = 32;
    const BASE_PREVIEW_FRAME_MS = 100;
    const MIN_FRAME_MS = 20;
    const MAX_TOTAL_PREVIEW_FRAMES = 120;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch animated cape: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const parsed = parseGIF(buffer);
    const rawFrames = decompressFrames(parsed, true);
    if (!rawFrames || rawFrames.length <= 1) {
      return url;
    }

    const sourceWidth = parsed?.lsd?.width ?? rawFrames[0]?.dims?.width;
    const sourceHeight = parsed?.lsd?.height ?? rawFrames[0]?.dims?.height;
    if (!sourceWidth || !sourceHeight) {
      return url;
    }

    // Convert variable GIF frame delays into the fixed 100ms cadence used by minecraft-skin-viewer.
    const frameRepeats: number[] = [];
    let previewFrameCount = 0;
    for (let i = 0; i < rawFrames.length; i++) {
      const frameDelayMs = Math.max(rawFrames[i].delay || BASE_PREVIEW_FRAME_MS, MIN_FRAME_MS);
      const repeats = Math.max(1, Math.round(frameDelayMs / BASE_PREVIEW_FRAME_MS));
      const available = Math.max(0, MAX_TOTAL_PREVIEW_FRAMES - previewFrameCount);
      const boundedRepeats = Math.min(repeats, available || 1);
      frameRepeats.push(boundedRepeats);
      previewFrameCount += boundedRepeats;
      if (previewFrameCount >= MAX_TOTAL_PREVIEW_FRAMES) {
        break;
      }
    }

    if (previewFrameCount <= 1) {
      return url;
    }

    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = sourceWidth;
    compositeCanvas.height = sourceHeight;
    const compositeContext = compositeCanvas.getContext('2d', { willReadFrequently: true });

    if (!compositeContext) {
      return url;
    }

    const spriteSheetCanvas = document.createElement('canvas');
    spriteSheetCanvas.width = CAPE_TEXTURE_WIDTH;
    spriteSheetCanvas.height = CAPE_TEXTURE_HEIGHT * previewFrameCount;
    const spriteSheetContext = spriteSheetCanvas.getContext('2d');

    if (!spriteSheetContext) {
      return url;
    }

    spriteSheetContext.imageSmoothingEnabled = false;
    compositeContext.imageSmoothingEnabled = false;

    let previousDisposalType = 0;
    let previousFrameDims: ParsedFrame['dims'] | null = null;
    let restoreBeforeCurrent: ImageData | null = null;
    let rowIndex = 0;

    for (let frameIndex = 0; frameIndex < frameRepeats.length; frameIndex++) {
      const frame = rawFrames[frameIndex];
      const dims = frame?.dims;
      if (!dims || !frame?.patch) {
        continue;
      }

      // Apply previous frame disposal before drawing this frame.
      if (previousDisposalType === 2 && previousFrameDims) {
        compositeContext.clearRect(
          previousFrameDims.left,
          previousFrameDims.top,
          previousFrameDims.width,
          previousFrameDims.height
        );
      } else if (previousDisposalType === 3 && restoreBeforeCurrent) {
        compositeContext.putImageData(restoreBeforeCurrent, 0, 0);
      }

      // For disposal=3, save the canvas state before drawing this frame.
      restoreBeforeCurrent = frame.disposalType === 3
        ? compositeContext.getImageData(0, 0, sourceWidth, sourceHeight)
        : null;

      const patchCanvas = document.createElement('canvas');
      patchCanvas.width = dims.width;
      patchCanvas.height = dims.height;
      const patchContext = patchCanvas.getContext('2d');
      if (!patchContext) {
        continue;
      }

      const frameImageData = new ImageData(
        new Uint8ClampedArray(frame.patch),
        dims.width,
        dims.height
      );
      patchContext.putImageData(frameImageData, 0, 0);

      const drawWidth = Math.max(dims.width, 1);
      const drawHeight = Math.max(dims.height, 1);
      compositeContext.drawImage(
        patchCanvas,
        0,
        0,
        drawWidth,
        drawHeight,
        dims.left,
        dims.top,
        drawWidth,
        drawHeight
      );

      const repeats = frameRepeats[frameIndex] ?? 1;
      for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex++) {
        spriteSheetContext.drawImage(
          compositeCanvas,
          0,
          0,
          sourceWidth,
          sourceHeight,
          0,
          rowIndex * CAPE_TEXTURE_HEIGHT,
          CAPE_TEXTURE_WIDTH,
          CAPE_TEXTURE_HEIGHT
        );
        rowIndex += 1;
      }

      previousDisposalType = frame.disposalType ?? 0;
      previousFrameDims = dims;
    }

    return spriteSheetCanvas.toDataURL('image/png');
  }, []);

  const loadCapeTexture = useCallback(async (viewer: SkinViewer, nextCapeUrl?: string) => {
    if (!nextCapeUrl) {
      viewer.loadCape(null);
      return;
    }

    try {
      let textureUrl = nextCapeUrl;
      if (isGifCapeUrl(nextCapeUrl)) {
        try {
          textureUrl = await buildAnimatedCapeSpriteSheetUrl(nextCapeUrl);
        } catch (gifError) {
          console.warn('Failed to build animated cape sprite sheet, using direct GIF:', gifError);
          textureUrl = nextCapeUrl;
        }
      }

      // Preload texture first so we don't flash a temporary black cape surface.
      try {
        await preloadCapeTexture(textureUrl);
      } catch (preloadError) {
        console.warn('Cape preload failed, falling back to direct load:', preloadError);
      }
      await viewer.loadCape(textureUrl);
      await waitForPaint();
    } catch (error) {
      console.error('Error loading cape texture:', error);
      throw error;
    }
  }, [
    buildAnimatedCapeSpriteSheetUrl,
    isGifCapeUrl,
    preloadCapeTexture,
    waitForPaint,
  ]);

  const waitForPlayerObject = useCallback(async (viewer: SkinViewer, maxAttempts = 5): Promise<boolean> => {
    for (let i = 0; i < maxAttempts; i++) {
      if (viewer.playerObject && viewer.playerObject.rotation) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return false;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const initViewer = async () => {
      if (!canvasRef.current) {
        return;
      }

      try {
        setIsLoading(true);
        setError(false);

        if (viewerRef.current) {
          viewerRef.current.dispose();
          viewerRef.current = null;
        }

        const { default: MinecraftSkinViewer } = await import('minecraft-skin-viewer');
        if (cancelled || !canvasRef.current) {
          return;
        }

        const viewer = new MinecraftSkinViewer({
          canvas: canvasRef.current,
          skin: '/mannequin.png',
          cape: null,
          dinnerbone: false,
          glint: false
        });

        const viewerAny = viewer as SkinViewer;
        if (viewerAny.renderer) {
          // Keep preview transparent while cape texture updates to avoid black flash.
          viewerAny.renderer.setClearColor(0x000000, 0);
        }

        viewerRef.current = viewer;

        // Wait for the player object to be ready before positioning
        const playerReady = await waitForPlayerObject(viewer);
        if (!playerReady) {
          console.warn('Player object not ready after waiting');
        }

        positionViewer();
        await loadCapeTexture(viewer, capeUrl);

        if (!cancelled) {
          setIsLoading(false);
          setError(false);
        }
      } catch (err) {
        console.error('Failed to create CapeViewer:', err);
        if (!cancelled) {
          setError(true);
          setIsLoading(false);
        }
      }
    };

    void initViewer();

    return () => {
      cancelled = true;

      if (viewerRef.current) {
        viewerRef.current.dispose();
        viewerRef.current = null;
      }
    };
  }, [capeUrl, loadCapeTexture, positionViewer, waitForPlayerObject]);

  useEffect(() => {
    if (!viewerRef.current) {
      return;
    }

    positionViewer();
  }, [height, positionViewer, width]);

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
          <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
};
