import React, { useState, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, useTexture } from '@react-three/drei';
import * as THREE from 'three';

export interface SpiralGalleryProps {
  images: string[];
}

function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

const vertexShader = `
  uniform float bendFactor;
  uniform float uRadius;
  uniform vec2 uScale;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 pos = position;
    
    // Scale local X to world X for mathematically perfect wrapping
    float worldX = pos.x * uScale.x;
    
    float theta = worldX / uRadius;
    float bentX = sin(theta) * uRadius;
    float bentZ = cos(theta) * uRadius - uRadius;
    
    // Convert back to local X so the mesh scale works, but leave Z unscaled
    pos.x = mix(worldX, bentX, bendFactor) / uScale.x;
    pos.z = mix(pos.z, bentZ, bendFactor);
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D map;
  uniform float opacity;
  varying vec2 vUv;
  void main() {
    vec4 texColor = texture2D(map, vUv);
    gl_FragColor = vec4(texColor.rgb, texColor.a * opacity);
  }
`;

interface CardData {
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scale: number;
}

const Card = ({ 
  url, 
  index, 
  total, 
  viewMode,
  scatterData,
  spiralData
}: { 
  url: string, 
  index: number, 
  total: number, 
  viewMode: 'scatter' | 'spiral' | 'list',
  scatterData: CardData,
  spiralData: CardData
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const texture = useTexture(url);
  
  const targetPos = useMemo(() => new THREE.Vector3(), []);
  const targetRot = useMemo(() => new THREE.Euler(), []);
  const targetScale = useMemo(() => new THREE.Vector3(), []);
  
  const uniforms = useMemo(() => ({
    map: { value: texture },
    bendFactor: { value: viewMode === 'spiral' ? 1.0 : 0.0 },
    uRadius: { value: 6.0 },
    uScale: { value: new THREE.Vector2(3, 1.6875) },
    opacity: { value: 1.0 }
  }), [texture]);
  
  useFrame((state, delta) => {
    if (!meshRef.current || !materialRef.current) return;

    let targetOpacity = 1.0;

    if (viewMode === 'scatter') {
      targetPos.set(scatterData.x, scatterData.y, scatterData.z);
      targetRot.set(scatterData.rotX, scatterData.rotY, scatterData.rotZ);
      targetScale.set(3 * scatterData.scale, 1.6875 * scatterData.scale, 1);
    } else if (viewMode === 'spiral') {
      // Flawless 360-degree floating S-Curve Cascade (matches reference image perfectly)
      const time = state.clock.getElapsedTime();
      const speed = 0.03; 
      const loops = 1.0; 
      
      const baseT = index / total; 
      const animatedT = (baseT + time * speed) % 1.0;
      
      // Start at -PI (Top-Back), sweep Left (-PI/2), Front (0), Right (PI/2), Back (PI)
      const tAngle = -Math.PI + animatedT * Math.PI * 2 * loops;
      
      // Dynamic layering offset perfectly prevents Z-fighting
      const layerOffset = animatedT * 1.0; 
      const radiusX = 6.5 + layerOffset;
      const radiusZ = 3.5 + layerOffset;
      
      const x = Math.sin(tAngle) * radiusX;
      
      // Z brings cards majestically forward in the center, pushes back at top/bottom
      const z = Math.cos(tAngle) * radiusZ;
      
      // Tall sweeping diagonal drop across the screen
      const y = 4.5 - animatedT * 9.0; 
      
      // Cards gracefully swivel inward to always face the camera
      const rotY = Math.sin(tAngle) * (Math.PI / 5); 
      
      // Playful, organic random slants (exactly as seen in reference)
      const seed = index * 123.45;
      const rotZ = Math.sin(seed) * (15 * Math.PI / 180); 
      const rotX = Math.cos(seed) * (15 * Math.PI / 180);

      targetPos.set(x, y, z);
      targetRot.set(rotX, rotY, rotZ);
      targetScale.set(3 * 1.1, 1.6875 * 1.1, 1);

      // Fade out at the very top and very bottom so they loop seamlessly
      const dist = Math.abs(animatedT - 0.5);
      targetOpacity = Math.max(0, 1.0 - Math.pow(dist * 2, 4));
    } else {
      const listCols = 4;
      const listRow = Math.floor(index / listCols);
      const listCol = index % listCols;
      
      const xSpacing = 3.5;
      const ySpacing = 2.5;
      
      const listX = (listCol - (listCols - 1) / 2) * xSpacing;
      const listY = -((listRow - Math.floor(total / listCols) / 2) * ySpacing) + 1.5;
      
      targetPos.set(listX, listY, 0);
      targetRot.set(0, 0, 0);
      targetScale.set(3, 1.6875, 1);
    }

    // Bypass lerp if the card is snapping from bottom to top in infinite scroll
    if (viewMode === 'spiral' && Math.abs(meshRef.current.position.y - targetPos.y) > 4) {
      meshRef.current.position.copy(targetPos);
      meshRef.current.quaternion.setFromEuler(targetRot);
      materialRef.current.uniforms.opacity.value = 0;
    } else {
      meshRef.current.position.lerp(targetPos, 0.08);
      const currentQuat = meshRef.current.quaternion;
      const tQuat = new THREE.Quaternion().setFromEuler(targetRot);
      currentQuat.slerp(tQuat, 0.08);
    }
    
    meshRef.current.scale.lerp(targetScale, 0.08);

    // Keep cards as pristine flat planes for flawless scatter layering
    const targetBend = 0.0;
    materialRef.current.uniforms.bendFactor.value = THREE.MathUtils.lerp(
      materialRef.current.uniforms.bendFactor.value, 
      targetBend, 
      0.08
    );
    
    // Set physical bend radius to perfectly match the average mathematical layout radius
    materialRef.current.uniforms.uRadius.value = 8.75; 
    materialRef.current.uniforms.uScale.value.set(targetScale.x, targetScale.y);
    materialRef.current.uniforms.opacity.value = THREE.MathUtils.lerp(
      materialRef.current.uniforms.opacity.value,
      targetOpacity,
      0.1
    );
  });

  return (
    <group>
      <mesh ref={meshRef}>
        <planeGeometry args={[1, 1, 32, 1]} />
        <shaderMaterial 
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          side={THREE.DoubleSide}
          transparent={true}
        />
      </mesh>
    </group>
  );
};

const Scene = ({ images, viewMode }: { images: string[], viewMode: 'scatter' | 'spiral' | 'list' }) => {
  const groupRef = useRef<THREE.Group>(null);
  
  const scatterLayout = useMemo(() => {
    const layout: CardData[] = [];
    const minDistance = 2.5; 
    
    for (let i = 0; i < images.length; i++) {
      let attempts = 0;
      let pos = { x: 0, y: 0, z: 0 };
      
      while (attempts < 100) {
        pos = {
          x: (seededRandom(i * 100 + attempts) - 0.5) * 16,
          y: (seededRandom(i * 100 + attempts + 1) - 0.5) * 8,
          z: (seededRandom(i * 100 + attempts + 2) - 0.5) * 4
        };
        
        let collides = false;
        for (const existing of layout) {
          const dx = existing.x - pos.x;
          const dy = existing.y - pos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < minDistance) { collides = true; break; }
        }
        if (!collides) break;
        attempts++;
      }
      
      const normalizedZ = (pos.z + 2) / 4;
      const scale = 0.7 + (normalizedZ * 0.4);
      
      const maxRotZ = 15 * (Math.PI / 180);
      const rotZ = (seededRandom(i * 200) - 0.5) * 2 * maxRotZ;
      const maxTilt = 5 * (Math.PI / 180);
      const rotX = (seededRandom(i * 201) - 0.5) * 2 * maxTilt;
      const rotY = (seededRandom(i * 202) - 0.5) * 2 * maxTilt;
      layout.push({ x: pos.x, y: pos.y, z: pos.z, rotX, rotY, rotZ, scale });
    }
    return layout;
  }, [images.length]);

  const spiralLayout = useMemo(() => {
    const layout: CardData[] = [];
    for (let i = 0; i < images.length; i++) {
      const t = i / Math.max(1, images.length - 1);
      
      const loops = 1.2; 
      const radius = 6.0; 
      // Offset angle so middle cards start near the front
      const angle = (t - 0.5) * Math.PI * 2 * loops;
      
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      
      const y = 3 - t * 6; 
      
      const rotY = angle;
      const rotZ = -8 * Math.PI / 180;
      const rotX = 0;

      // Scale tuned back to elegant proportions (1.2) so it breathes properly
      layout.push({ x, y, z, rotX, rotY, rotZ, scale: 1.2 });
    }
    return layout;
  }, [images.length]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    
    const time = state.clock.getElapsedTime();
    
    if (viewMode === 'spiral') {
      // Keep the path firmly anchored so the S-curve beautifully faces the camera,
      // letting the cards do the sliding motion gracefully.
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, 0, 0.05);
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, 0.05);
      
      // Gentle floating breathing animation
      groupRef.current.position.y = Math.sin(time * 0.5) * 0.2;
      groupRef.current.position.x = 0;
    } else if (viewMode === 'scatter') {
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, 0, 0.05);
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, 0.05);
      
      groupRef.current.position.y = Math.sin(time * 0.5) * 0.2;
      groupRef.current.position.x = Math.cos(time * 0.3) * 0.1;
    } else {
      groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, 0, 0.05);
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, 0.05);
      
      groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, 0, 0.05);
      groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, 0, 0.05);
    }
  });

  return (
    <group ref={groupRef}>
      {images.map((img, i) => (
        <Card 
          key={i} 
          url={img} 
          index={i} 
          total={images.length} 
          viewMode={viewMode}
          scatterData={scatterLayout[i]}
          spiralData={spiralLayout[i]}
        />
      ))}
    </group>
  );
};

const Loader = () => {
  return (
    <Html center>
      <div className="text-white/50 animate-pulse font-medium whitespace-nowrap">Loading 3D Engine...</div>
    </Html>
  )
}

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 text-red-500 font-mono p-8 overflow-auto">
          <div>
            <h1 className="text-xl font-bold mb-4">React Error</h1>
            <pre>{this.state.error?.toString()}</pre>
            <pre className="text-sm mt-4 opacity-50">{this.state.error?.stack}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const SpiralGallery: React.FC<SpiralGalleryProps> = ({ images }) => {
  const [viewMode, setViewMode] = useState<'spiral' | 'scatter' | 'list'>('spiral');

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden z-10 bg-black">
      <div className="absolute inset-0 z-0 pointer-events-none" style={{
        backgroundImage: 'url(/blue-black-gradient.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }} />

      <div className="z-10 flex flex-col items-center justify-center gap-6">
        <h1 className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-white/40 tracking-tighter drop-shadow-2xl">
          COMING SOON
        </h1>
        <p className="text-white/60 text-lg md:text-xl font-medium tracking-widest uppercase">
          Something amazing is in the works
        </p>
      </div>
    </div>
  );
};
