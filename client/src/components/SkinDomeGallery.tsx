import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useGesture } from '@use-gesture/react';
import './DomeGallery.css';

interface Skin {
  id: string;
  name: string;
  author: string;
  downloads: number;
  likes: number;
  imageUrl: string;
  renderUrl: string;
  downloadUrl: string;
  tags: string[];
  model: 'steve' | 'alex';
  uuid?: string;
}

interface SkinDomeGalleryProps {
  skins: Skin[];
  onSkinSelect: (skin: Skin) => void;
  selectedSkin?: Skin | null;
  fit?: number;
  minRadius?: number;
  maxVerticalRotationDeg?: number;
  segments?: number;
  dragDampening?: number;
  grayscale?: boolean;
}

const DEFAULTS = {
  maxVerticalRotationDeg: 5,
  dragSensitivity: 20,
  enlargeTransitionMs: 300,
  segments: 35
};

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const normalizeAngle = (d: number) => ((d % 360) + 360) % 360;
const wrapAngleSigned = (deg: number) => {
  const a = (((deg + 180) % 360) + 360) % 360;
  return a - 180;
};

const getDataNumber = (el: HTMLElement, name: string, fallback: number) => {
  const attr = el.dataset[name] ?? el.getAttribute(`data-${name}`);
  const n = attr == null ? NaN : parseFloat(attr);
  return Number.isFinite(n) ? n : fallback;
};

function buildItems(pool: Skin[], seg: number) {
  const xCols = Array.from({ length: seg }, (_, i) => -37 + i * 2);
  const evenYs = [-4, -2, 0, 2, 4];
  const oddYs = [-3, -1, 1, 3, 5];
  
  const coords = xCols.flatMap((x, c) => {
    const ys = c % 2 === 0 ? evenYs : oddYs;
    return ys.map(y => ({ x, y, sizeX: 2, sizeY: 2 }));
  });

  const totalSlots = coords.length;
  
  if (pool.length === 0) {
    return coords.map(c => ({ ...c, skin: null }));
  }

  if (pool.length > totalSlots) {
    console.warn(`[SkinDomeGallery] Provided skin count (${pool.length}) exceeds available tiles (${totalSlots}). Some skins will not be shown.`);
  }

  const usedSkins = Array.from({ length: totalSlots }, (_, i) => 
    pool[i % pool.length] || null
  );

  // Shuffle to avoid repetitive patterns
  for (let i = 1; i < usedSkins.length; i++) {
    if (usedSkins[i] && usedSkins[i - 1] && usedSkins[i].id === usedSkins[i - 1]?.id) {
      for (let j = i + 1; j < usedSkins.length; j++) {
        if (usedSkins[j] && usedSkins[j].id !== usedSkins[i].id) {
          const tmp = usedSkins[i];
          usedSkins[i] = usedSkins[j];
          usedSkins[j] = tmp;
          break;
        }
      }
    }
  }

  return coords.map((c, i) => ({
    ...c,
    skin: usedSkins[i]
  }));
}

function computeItemBaseRotation(offsetX: number, offsetY: number, sizeX: number, sizeY: number, segments: number) {
  const unit = 360 / segments / 2;
  const rotateY = unit * (offsetX + (sizeX - 1) / 2);
  const rotateX = unit * (offsetY - (sizeY - 1) / 2);
  return { rotateX, rotateY };
}

export default function SkinDomeGallery({
  skins = [],
  onSkinSelect,
  selectedSkin,
  fit = 0.8,
  minRadius = 600,
  maxVerticalRotationDeg = DEFAULTS.maxVerticalRotationDeg,
  segments = DEFAULTS.segments,
  dragDampening = 2,
  grayscale = true
}: SkinDomeGalleryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const sphereRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const focusedElRef = useRef<HTMLDivElement | null>(null);
  const originalTilePositionRef = useRef<DOMRect | null>(null);
  const rotationRef = useRef({ x: 0, y: 0 });
  const startRotRef = useRef({ x: 0, y: 0 });
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const inertiaRAF = useRef<number | null>(null);
  const openingRef = useRef(false);
  const openStartedAtRef = useRef(0);
  const lastDragEndAt = useRef(0);
  const scrollLockedRef = useRef(false);

  const lockScroll = useCallback(() => {
    if (scrollLockedRef.current) return;
    scrollLockedRef.current = true;
    document.body.classList.add('dg-scroll-lock');
  }, []);

  const unlockScroll = useCallback(() => {
    if (!scrollLockedRef.current) return;
    if (rootRef.current?.getAttribute('data-enlarging') === 'true') return;
    scrollLockedRef.current = false;
    document.body.classList.remove('dg-scroll-lock');
  }, []);

  const items = useMemo(() => buildItems(skins, segments), [skins, segments]);

  const applyTransform = (xDeg: number, yDeg: number) => {
    const el = sphereRef.current;
    if (el) {
      el.style.transform = `translateZ(calc(var(--radius) * -1)) rotateX(${xDeg}deg) rotateY(${yDeg}deg)`;
    }
  };

  const lockedRadiusRef = useRef<number | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const ro = new ResizeObserver(entries => {
      const cr = entries[0].contentRect;
      const w = Math.max(1, cr.width);
      const h = Math.max(1, cr.height);
      const minDim = Math.min(w, h);
      
      let radius = minDim * fit;
      const heightGuard = h * 1.35;
      radius = Math.min(radius, heightGuard);
      radius = clamp(radius, minRadius, Infinity);
      
      lockedRadiusRef.current = Math.round(radius);
      
      const viewerPad = Math.max(8, Math.round(minDim * 0.25));
      
      root.style.setProperty('--radius', `${lockedRadiusRef.current}px`);
      root.style.setProperty('--viewer-pad', `${viewerPad}px`);
      root.style.setProperty('--overlay-blur-color', '#060010');
      root.style.setProperty('--tile-radius', '12px');
      root.style.setProperty('--enlarge-radius', '20px');
      root.style.setProperty('--image-filter', grayscale ? 'grayscale(1)' : 'none');
      
      applyTransform(rotationRef.current.x, rotationRef.current.y);
    });

    ro.observe(root);
    return () => ro.disconnect();
  }, [fit, minRadius, grayscale]);

  useEffect(() => {
    applyTransform(rotationRef.current.x, rotationRef.current.y);
  }, []);

  const stopInertia = useCallback(() => {
    if (inertiaRAF.current) {
      cancelAnimationFrame(inertiaRAF.current);
      inertiaRAF.current = null;
    }
  }, []);

  const startInertia = useCallback((vx: number, vy: number) => {
    const MAX_V = 1.4;
    let vX = clamp(vx, -MAX_V, MAX_V) * 80;
    let vY = clamp(vy, -MAX_V, MAX_V) * 80;
    let frames = 0;
    
    const d = clamp(dragDampening ?? 0.6, 0, 1);
    const frictionMul = 0.94 + 0.055 * d;
    const stopThreshold = 0.015 - 0.01 * d;
    const maxFrames = Math.round(90 + 270 * d);

    const step = () => {
      vX *= frictionMul;
      vY *= frictionMul;
      
      if (Math.abs(vX) < stopThreshold && Math.abs(vY) < stopThreshold) {
        inertiaRAF.current = null;
        return;
      }
      
      if (++frames > maxFrames) {
        inertiaRAF.current = null;
        return;
      }

      const nextX = clamp(
        rotationRef.current.x - vY / 200,
        -maxVerticalRotationDeg,
        maxVerticalRotationDeg
      );
      const nextY = wrapAngleSigned(rotationRef.current.y + vX / 200);
      
      rotationRef.current = { x: nextX, y: nextY };
      applyTransform(nextX, nextY);
      
      inertiaRAF.current = requestAnimationFrame(step);
    };

    stopInertia();
    inertiaRAF.current = requestAnimationFrame(step);
  }, [dragDampening, maxVerticalRotationDeg, stopInertia]);

  useGesture({
    onDragStart: ({ event }) => {
      if (focusedElRef.current) return;
      stopInertia();
      
      const evt = event as PointerEvent;
      draggingRef.current = true;
      movedRef.current = false;
      startRotRef.current = { ...rotationRef.current };
      startPosRef.current = { x: evt.clientX, y: evt.clientY };
    },
    onDrag: ({ event, last, velocity = [0, 0], direction = [0, 0], movement }) => {
      if (focusedElRef.current || !draggingRef.current || !startPosRef.current) return;
      
      const evt = event as PointerEvent;
      const dxTotal = evt.clientX - startPosRef.current.x;
      const dyTotal = evt.clientY - startPosRef.current.y;
      
      if (!movedRef.current) {
        const dist2 = dxTotal * dxTotal + dyTotal * dyTotal;
        if (dist2 > 16) movedRef.current = true;
      }

      const dragSensitivity = DEFAULTS.dragSensitivity;
      const nextX = clamp(
        startRotRef.current.x - dyTotal / dragSensitivity,
        -maxVerticalRotationDeg,
        maxVerticalRotationDeg
      );
      const nextY = wrapAngleSigned(startRotRef.current.y + dxTotal / dragSensitivity);

      if (rotationRef.current.x !== nextX || rotationRef.current.y !== nextY) {
        rotationRef.current = { x: nextX, y: nextY };
        applyTransform(nextX, nextY);
      }

      if (last) {
        draggingRef.current = false;
        let [vMagX, vMagY] = velocity;
        const [dirX, dirY] = direction;
        let vx = vMagX * dirX;
        let vy = vMagY * dirY;

        if (Math.abs(vx) < 0.001 && Math.abs(vy) < 0.001 && Array.isArray(movement)) {
          const [mx, my] = movement;
          vx = clamp((mx / dragSensitivity) * 0.02, -1.2, 1.2);
          vy = clamp((my / dragSensitivity) * 0.02, -1.2, 1.2);
        }

        if (Math.abs(vx) > 0.005 || Math.abs(vy) > 0.005) startInertia(vx, vy);
        if (movedRef.current) lastDragEndAt.current = performance.now();
        movedRef.current = false;
      }
    }
  }, { target: mainRef, eventOptions: { passive: true } });

  const onTileClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingRef.current) return;
    if (movedRef.current) return;
    if (performance.now() - lastDragEndAt.current < 80) return;
    if (openingRef.current) return;

    const target = e.currentTarget;
    const parent = target.parentElement;
    if (!parent) return;

    const skinData = parent.dataset.skin;
    if (skinData) {
      try {
        const skin = JSON.parse(skinData);
        
        // Show detailed skin card modal
        showSkinCard(skin);
      } catch (error) {
        console.error('Failed to parse skin data:', error);
      }
    }
  }, []);

  const showSkinCard = useCallback((skin: Skin) => {
    if (openingRef.current) return;
    openingRef.current = true;
    openStartedAtRef.current = performance.now();
    lockScroll();

    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      z-index: 999;
      opacity: 0;
      transition: opacity 300ms ease;
      backdrop-filter: blur(5px);
    `;

    // Create card modal
    const card = document.createElement('div');
    card.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.9);
      width: 400px;
      max-width: 90vw;
      background: rgba(0, 0, 0, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 20px;
      z-index: 1000;
      opacity: 0;
      transition: all 300ms ease;
      padding: 24px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
    `;

    // Create card content
    card.innerHTML = `
      <div style="text-align: center;">
        <!-- Close button -->
        <button id="close-btn" style="
          position: absolute;
          top: 16px;
          right: 16px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 50%;
          width: 32px;
          height: 32px;
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          transition: background 200ms ease;
        " onmouseover="this.style.background='rgba(255, 255, 255, 0.2)'" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'">
          ×
        </button>

        <!-- 3D Body Render -->
        <div style="margin-bottom: 20px; display: flex; justify-content: center;">
          <img 
            src="${skin.renderUrl}" 
            alt="${skin.name}"
            style="
              width: 200px;
              height: 280px;
              object-fit: contain;
              image-rendering: pixelated;
              border-radius: 12px;
              background: rgba(255, 255, 255, 0.05);
              padding: 10px;
            "
            onerror="if (!this.src.includes('MHF_Steve')) this.src = 'https://mc-heads.net/body/MHF_Steve/200';"
          />
        </div>

        <!-- Skin Info -->
        <div style="margin-bottom: 24px;">
          <h3 style="
            color: white;
            font-size: 24px;
            font-weight: bold;
            margin: 0 0 8px 0;
          ">${skin.name}</h3>
          <p style="
            color: #60a5fa;
            font-size: 16px;
            margin: 0 0 4px 0;
          ">by ${skin.author}</p>
          <p style="
            color: #9ca3af;
            font-size: 14px;
            margin: 0;
          ">${skin.model === 'steve' ? 'Classic Model' : 'Slim Model'}</p>
        </div>

        <!-- Stats -->
        <div style="
          display: flex;
          justify-content: space-around;
          margin-bottom: 24px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
        ">
          <div style="text-align: center;">
            <div style="color: #9ca3af; font-size: 12px; margin-bottom: 4px;">Downloads</div>
            <div style="color: white; font-weight: bold;">${skin.downloads > 1000 ? `${(skin.downloads/1000).toFixed(1)}k` : skin.downloads}</div>
          </div>
          <div style="text-align: center;">
            <div style="color: #9ca3af; font-size: 12px; margin-bottom: 4px;">Likes</div>
            <div style="color: #fbbf24; font-weight: bold;">★ ${skin.likes}</div>
          </div>
        </div>

        <!-- Apply Button -->
        <button id="apply-btn" style="
          width: 100%;
          padding: 16px;
          background: white;
          color: black;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: all 200ms ease;
        " onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='white'">
          Apply This Skin
        </button>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(card);

    // Animate in
    requestAnimationFrame(() => {
      backdrop.style.opacity = '1';
      card.style.opacity = '1';
      card.style.transform = 'translate(-50%, -50%) scale(1)';
      rootRef.current?.setAttribute('data-enlarging', 'true');
    });

    // Close handlers
    const closeCard = () => {
      backdrop.style.opacity = '0';
      card.style.opacity = '0';
      card.style.transform = 'translate(-50%, -50%) scale(0.9)';
      
      setTimeout(() => {
        if (document.body.contains(backdrop)) document.body.removeChild(backdrop);
        if (document.body.contains(card)) document.body.removeChild(card);
        openingRef.current = false;
        rootRef.current?.removeAttribute('data-enlarging');
        unlockScroll();
      }, 300);
    };

    // Event listeners
    backdrop.addEventListener('click', closeCard);
    card.querySelector('#close-btn')?.addEventListener('click', closeCard);
    
    card.querySelector('#apply-btn')?.addEventListener('click', () => {
      onSkinSelect(skin);
      // Trigger apply skin function if available
      const windowWithApply = window as Window & {
        handleApplySkin?: (selectedSkin: any) => void;
      };
      windowWithApply.handleApplySkin?.(skin);
      closeCard();
    });
    
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeCard();
        document.removeEventListener('keydown', onKeyDown);
      }
    };
    document.addEventListener('keydown', onKeyDown);

  }, [lockScroll, unlockScroll, onSkinSelect]);

  const onTilePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'touch') return;
    if (draggingRef.current) return;
    if (movedRef.current) return;
    if (performance.now() - lastDragEndAt.current < 80) return;
    if (openingRef.current) return;

    const target = e.currentTarget;
    const parent = target.parentElement;
    if (!parent) return;

    const skinData = parent.dataset.skin;
    if (skinData) {
      try {
        const skin = JSON.parse(skinData);
        onSkinSelect(skin);
      } catch (error) {
        console.error('Failed to parse skin data:', error);
      }
    }
  }, [onSkinSelect]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('dg-scroll-lock');
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="sphere-root"
      style={{
        ['--segments-x' as any]: segments,
        ['--segments-y' as any]: segments,
        ['--overlay-blur-color' as any]: '#060010',
        ['--tile-radius' as any]: '12px',
        ['--enlarge-radius' as any]: '20px',
        ['--image-filter' as any]: grayscale ? 'grayscale(1)' : 'none'
      }}
    >
      <main ref={mainRef} className="sphere-main">
        <div className="stage">
          <div ref={sphereRef} className="sphere">
            {items.map((it, i) => (
              <div
                key={`${it.x},${it.y},${i}`}
                className="item"
                data-skin={it.skin ? JSON.stringify(it.skin) : ''}
                data-offset-x={it.x}
                data-offset-y={it.y}
                data-size-x={it.sizeX}
                data-size-y={it.sizeY}
                style={{
                  ['--offset-x' as any]: it.x,
                  ['--offset-y' as any]: it.y,
                  ['--item-size-x' as any]: it.sizeX,
                  ['--item-size-y' as any]: it.sizeY
                }}
              >
                <div
                  className="item__image"
                  role="button"
                  tabIndex={0}
                  aria-label={it.skin?.name || 'Skin option'}
                  onClick={onTileClick}
                  onPointerUp={onTilePointerUp}
                >
                  {it.skin && (
                    <img 
                      src={it.skin.imageUrl} 
                      draggable={false} 
                      alt={it.skin.name}
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (!img.src.includes('MHF_Steve')) {
                          img.src = 'https://mc-heads.net/avatar/MHF_Steve/64';
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="overlay" />
        <div className="overlay overlay--blur" />
        <div className="edge-fade edge-fade--top" />
        <div className="edge-fade edge-fade--bottom" />
        <div className="viewer" ref={viewerRef}>
          <div ref={scrimRef} className="scrim" />
          <div ref={frameRef} className="frame" />
        </div>
      </main>
    </div>
  );
}
