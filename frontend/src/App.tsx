import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { 
  MapPin, 
  Users as UsersIcon, 
  Layers,
  Award,
  Maximize2, 
  Minimize2, 
  RotateCcw, 
  Info
} from 'lucide-react';

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const COLOR_OPTIONS = [
  '#3b82f6', // Neon Blue
  '#10b981', // Emerald
  '#ec4899', // Hot Pink
  '#8b5cf6', // Violet
  '#f97316', // Sunset Orange
  '#eab308', // Bright Gold
  '#06b6d4', // Mint
  '#ef4444', // Crimson
  '#a855f7', // Purple
  '#14b8a6', // Teal
  '#f43f5e', // Rose
  '#84cc16'  // Lime
];

interface LeaderboardEntry {
  name: string;
  color: string;
  count: number;
}

interface Coords {
  x: number;
  y: number;
}

function App() {
  // User Onboarding State
  const [username, setUsername] = useState<string>(() => {
    return localStorage.getItem('grid_username') || '';
  });
  const [userColor, setUserColor] = useState<string>(() => {
    return localStorage.getItem('grid_color') || COLOR_OPTIONS[Math.floor(Math.random() * COLOR_OPTIONS.length)];
  });
  const [isJoined, setIsJoined] = useState<boolean>(() => {
    return !!localStorage.getItem('grid_username');
  });

  const [inputName, setInputName] = useState<string>(username);

  // Hook for WebSockets
  const {
    status,
    gridSize,
    blocks,
    onlineUsers,
    cooldown,
    errorMsg,
    claimBlock,
  } = useWebSocket(SOCKET_URL, username, userColor);

  // Canvas Refs & Zoom/Pan State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [zoom, setZoom] = useState<number>(1.5);
  const [pan, setPan] = useState<Coords>({ x: 100, y: 100 });
  const [hoveredCell, setHoveredCell] = useState<Coords | null>(null);

  const isDragging = useRef<boolean>(false);
  const dragStart = useRef<Coords>({ x: 0, y: 0 });
  const panStart = useRef<Coords>({ x: 0, y: 0 });
  const mouseHasMoved = useRef<boolean>(false);

  // Cell dimensions at base zoom (1.0)
  const CELL_SIZE = 24;

  // Handle Form Join
  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputName.trim()) return;
    const cleanName = inputName.trim().substring(0, 16);
    setUsername(cleanName);
    localStorage.setItem('grid_username', cleanName);
    localStorage.setItem('grid_color', userColor);
    setIsJoined(true);
  };

  // Leaderboard Calculation
  const leaderboard = useMemo<LeaderboardEntry[]>(() => {
    const counts: Record<string, number> = {};
    Object.values(blocks).forEach((block) => {
      const key = `${block.ownerName}::${block.ownerColor}`;
      counts[key] = (counts[key] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([key, count]) => {
        const [name, color] = key.split('::');
        return { name, color, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [blocks]);

  // Convert client/screen coords to Grid coordinates
  const screenToGrid = useCallback((clientX: number, clientY: number): Coords | null => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    const gridX = Math.floor((x - pan.x) / (CELL_SIZE * zoom));
    const gridY = Math.floor((y - pan.y) / (CELL_SIZE * zoom));

    if (gridX >= 0 && gridX < gridSize && gridY >= 0 && gridY < gridSize) {
      return { x: gridX, y: gridY };
    }
    return null;
  }, [zoom, pan, gridSize]);

  // Draw Canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear Canvas
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();

    // 1. Draw Grid Blocks & Claimed blocks
    const size = CELL_SIZE * zoom;
    const gridPixelSize = gridSize * size;

    // Background of grid area
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(pan.x, pan.y, gridPixelSize, gridPixelSize);

    // Draw claimed blocks
    Object.entries(blocks).forEach(([key, block]) => {
      const [bx, by] = key.split(',').map(Number);
      ctx.fillStyle = block.ownerColor || '#ffffff';
      ctx.fillRect(
        pan.x + bx * size,
        pan.y + by * size,
        size,
        size
      );
    });

    // Draw grid lines (if zoom is high enough to make lines visible without clutter)
    if (zoom >= 0.4) {
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;

      // Vertical lines
      for (let i = 0; i <= gridSize; i++) {
        const xPos = pan.x + i * size;
        ctx.beginPath();
        ctx.moveTo(xPos, pan.y);
        ctx.lineTo(xPos, pan.y + gridPixelSize);
        ctx.stroke();
      }

      // Horizontal lines
      for (let j = 0; j <= gridSize; j++) {
        const yPos = pan.y + j * size;
        ctx.beginPath();
        ctx.moveTo(pan.x, yPos);
        ctx.lineTo(pan.x + gridPixelSize, yPos);
        ctx.stroke();
      }
    } else {
      // Draw grid boundary only
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.strokeRect(pan.x, pan.y, gridPixelSize, gridPixelSize);
    }

    // 2. Draw Hover Preview / Cursor Highlight
    if (hoveredCell && isJoined) {
      ctx.fillStyle = userColor;
      ctx.globalAlpha = 0.4;
      ctx.fillRect(
        pan.x + hoveredCell.x * size,
        pan.y + hoveredCell.y * size,
        size,
        size
      );
      
      // Outline
      ctx.strokeStyle = userColor;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        pan.x + hoveredCell.x * size,
        pan.y + hoveredCell.y * size,
        size,
        size
      );
    }

    ctx.restore();
  }, [zoom, pan, blocks, gridSize, hoveredCell, userColor, isJoined]);

  // Handle Resize
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
    draw();
  }, [draw]);

  // Adjust canvas size on load and resize
  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // Redraw when states change
  useEffect(() => {
    draw();
  }, [draw]);

  // Recenter Board
  const recenter = useCallback(() => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const size = CELL_SIZE * zoom;
    const gridPixelSize = gridSize * size;
    setPan({
      x: (rect.width - gridPixelSize) / 2,
      y: (rect.height - gridPixelSize) / 2,
    });
  }, [zoom, gridSize]);

  // Recenter on first load/joined
  useEffect(() => {
    if (isJoined) {
      setTimeout(recenter, 100);
    }
  }, [isJoined, recenter]);

  // Zoom Helpers
  const handleZoom = (factor: number) => {
    setZoom((prev) => {
      const nextZoom = Math.min(8.0, Math.max(0.15, prev * factor));
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const gridCenterX = (centerX - pan.x) / prev;
        const gridCenterY = (centerY - pan.y) / prev;

        setPan({
          x: centerX - gridCenterX * nextZoom,
          y: centerY - gridCenterY * nextZoom,
        });
      }
      return nextZoom;
    });
  };

  // Mouse Handlers for zoom and pan
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // Left click only
    isDragging.current = true;
    mouseHasMoved.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const cell = screenToGrid(e.clientX, e.clientY);
    setHoveredCell(cell);

    if (!isDragging.current) return;

    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      mouseHasMoved.current = true;
    }

    setPan({
      x: panStart.current.x + dx,
      y: panStart.current.y + dy,
    });
  };

  const onMouseUp = () => {
    isDragging.current = false;
    if (!mouseHasMoved.current && hoveredCell) {
      claimBlock(hoveredCell.x, hoveredCell.y);
    }
  };

  // Wheel zoom
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    
    setZoom((prev) => {
      const nextZoom = Math.min(8.0, Math.max(0.15, prev * zoomFactor));
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        const gridX = (cursorX - pan.x) / prev;
        const gridY = (cursorY - pan.y) / prev;

        setPan({
          x: cursorX - gridX * nextZoom,
          y: cursorY - gridY * nextZoom,
        });
      }
      return nextZoom;
    });
  };

  // Cooldown Ring Calculations
  const cooldownPercent = cooldown > 0 ? (cooldown / 1500) * 100 : 0;
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (cooldownPercent / 100) * circumference;

  // Reset Grid Handlers
  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to clear the entire grid?')) return;
    try {
      await fetch(`${API_URL}/api/reset`, { method: 'POST' });
    } catch (error) {
      console.error('Failed to reset:', error);
    }
  };

  // Return Onboarding if not joined
  if (!isJoined) {
    return (
      <div className="onboarding-overlay">
        <form onSubmit={handleJoin} className="onboarding-card glass-panel">
          <div className="logo-container">
            <Layers className="logo-icon" size={32} />
            <span className="logo-text">PixelGrid.io</span>
          </div>
          
          <div>
            <h1 className="onboarding-title">Claim Your Territory</h1>
            <p className="onboarding-subtitle">
              A real-time multiplayer collaborative canvas. Pick a name and color, then click to capture blocks!
            </p>
          </div>

          <div className="input-group">
            <span className="input-label">Username</span>
            <input
              type="text"
              className="username-input"
              placeholder="Enter username (max 16 chars)"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              maxLength={16}
              required
            />
          </div>

          <div className="input-group">
            <span className="input-label">Select Color</span>
            <div className="color-picker-grid">
              {COLOR_OPTIONS.map((color) => (
                <div
                  key={color}
                  className={`color-option ${userColor === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setUserColor(color)}
                />
              ))}
            </div>
          </div>

          <button type="submit" className="btn-primary">
            Enter Sandbox
          </button>
        </form>
      </div>
    );
  }

  // Active Block details
  const activeBlockOwner = hoveredCell ? blocks[`${hoveredCell.x},${hoveredCell.y}`] : null;

  return (
    <div className="app-container">
      {/* Error Notification */}
      {errorMsg && (
        <div className="error-banner">
          <Info size={18} />
          {errorMsg}
        </div>
      )}

      {/* Main Interactive Map */}
      <div 
        className="canvas-container"
        ref={containerRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onWheel={onWheel}
      >
        <canvas ref={canvasRef} />
      </div>

      {/* Floating UI HUD & Sidebar panels */}
      <div className="floating-overlay">
        
        {/* Left column: Profile & HUD info */}
        <div className="floating-column-left">
          
          {/* Profile Card */}
          <div className="control-card glass-panel pointer-events-auto">
            <div className="card-header">
              <div className="logo-container">
                <Layers className="logo-icon" size={20} />
                <span className="logo-text" style={{ fontSize: '18px' }}>PixelGrid</span>
              </div>
              
              <div className={`status-indicator ${status.toLowerCase()}`}>
                <span className="pulse" />
                {status}
              </div>
            </div>

            <div className="profile-badge">
              <span className="avatar-dot" style={{ color: userColor, backgroundColor: userColor }} />
              <div className="profile-name">{username}</div>
            </div>

            <div className="help-hint">
              <strong>Tip:</strong> Drag to pan, scroll to zoom. Click any block to claim it.
            </div>
          </div>

          {/* Block Info HUD */}
          {hoveredCell && (
            <div className="hud-panel glass-panel">
              <div className="hud-label">Hovered Block</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                <MapPin size={14} className="logo-icon" />
                X: {hoveredCell.x}, Y: {hoveredCell.y}
              </div>
              <div style={{ marginTop: '8px' }}>
                {activeBlockOwner ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span 
                      className="avatar-dot" 
                      style={{ 
                        color: activeBlockOwner.ownerColor, 
                        backgroundColor: activeBlockOwner.ownerColor,
                        width: '12px',
                        height: '12px'
                      }} 
                    />
                    <span>Owned by <strong>{activeBlockOwner.ownerName}</strong></span>
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Unclaimed Block</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Stats, Leaderboard & Controls */}
        <div className="floating-column-right">
          
          {/* Stats & Leaderboard */}
          <div className="control-card glass-panel pointer-events-auto">
            <div className="card-title">
              <Award size={18} className="logo-icon" />
              Leaderboard
            </div>

            <div className="leaderboard-list">
              {leaderboard.length > 0 ? (
                leaderboard.map((item, index) => (
                  <div key={index} className="leaderboard-item">
                    <div className="leaderboard-user">
                      <span className="rank-number">#{index + 1}</span>
                      <span 
                        className="rank-color-dot" 
                        style={{ backgroundColor: item.color }} 
                      />
                      <span>{item.name}</span>
                    </div>
                    <span className="user-score">{item.count} blocks</span>
                  </div>
                ))
              ) : (
                <div className="leaderboard-empty">No blocks claimed yet.</div>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border-card)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <UsersIcon size={14} /> Users Online:
              </span>
              <strong style={{ color: '#6366f1' }}>{onlineUsers}</strong>
            </div>
          </div>

          {/* Cooldown Timer Notification */}
          {cooldown > 0 && (
            <div className="cooldown-indicator glass-panel pointer-events-auto">
              <div className="cooldown-ring">
                <svg className="cooldown-svg">
                  <circle className="cooldown-bg" cx="10" cy="10" r={radius} />
                  <circle 
                    className="cooldown-progress" 
                    cx="10" 
                    cy="10" 
                    r={radius} 
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                  />
                </svg>
              </div>
              <span>COOLDOWN: {(cooldown / 1000).toFixed(1)}s</span>
            </div>
          )}

          {/* Action Tools */}
          <div className="zoom-controls">
            <button className="zoom-btn" onClick={() => handleZoom(1.2)} title="Zoom In">
              <Maximize2 size={16} />
            </button>
            <button className="zoom-btn" onClick={() => handleZoom(0.8)} title="Zoom Out">
              <Minimize2 size={16} />
            </button>
            <button className="zoom-btn" onClick={recenter} title="Recenter Grid">
              <RotateCcw size={16} />
            </button>
          </div>

          {/* Admin Clean Board */}
          <button className="reset-btn pointer-events-auto" onClick={handleReset}>
            Reset Playground
          </button>
        </div>

      </div>
    </div>
  );
}

export default App;
