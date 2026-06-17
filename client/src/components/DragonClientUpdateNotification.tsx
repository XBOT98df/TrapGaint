import React from 'react';
import { useDragonClientUpdater } from '../hooks/useDragonClientUpdater';

interface Props {
  minecraftVersion: string;
  instancePath: string;
}

export function DragonClientUpdateNotification({ minecraftVersion, instancePath }: Props) {
  const { status, updateDragonClient } = useDragonClientUpdater(minecraftVersion, instancePath);

  if (!status.available || status.updating) {
    return null;
  }

  const handleUpdate = async () => {
    try {
      await updateDragonClient();
      // Show success notification
      alert('Dragon Client updated successfully!');
    } catch (error) {
      alert(`Failed to update Dragon Client: ${error}`);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '16px 24px',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
      zIndex: 1000,
      maxWidth: '400px',
      animation: 'slideIn 0.3s ease-out',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ fontSize: '24px' }}>🐉</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
            Dragon Client Update Available
          </div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>
            Version {status.latestVersion} is ready to install
          </div>
        </div>
        <button
          onClick={handleUpdate}
          style={{
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
        >
          Update Now
        </button>
      </div>
      
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
