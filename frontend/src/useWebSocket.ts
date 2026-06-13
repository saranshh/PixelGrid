import { useState, useEffect, useRef, useCallback } from 'react';

export type ConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';

export interface BlockState {
  ownerName: string;
  ownerColor: string;
}

export interface BlockInitData {
  x: number;
  y: number;
  ownerName: string;
  ownerColor: string;
}

export type WSMessage =
  | { type: 'INIT'; gridSize: number; blocks: BlockInitData[] }
  | { type: 'UPDATE'; x: number; y: number; ownerName: string; ownerColor: string }
  | { type: 'RESET' }
  | { type: 'STATS'; onlineUsers: number }
  | { type: 'COOLDOWN_START'; cooldownMs: number }
  | { type: 'ERROR'; message: string };

export function useWebSocket(url: string, username: string, userColor: string) {
  const [status, setStatus] = useState<ConnectionStatus>('CONNECTING');
  const [gridSize, setGridSize] = useState<number>(100);
  const [blocks, setBlocks] = useState<Record<string, BlockState>>({});
  const [onlineUsers, setOnlineUsers] = useState<number>(0);
  const [cooldown, setCooldown] = useState<number>(0); // Remaining cooldown in ms
  const [errorMsg, setErrorMsg] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Helper to trigger cooldown
  const startCooldown = useCallback((durationMs: number) => {
    setCooldown(durationMs);
    if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    
    const startTime = Date.now();
    cooldownIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, durationMs - elapsed);
      setCooldown(remaining);
      if (remaining <= 0 && cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    }, 50);
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setStatus(prev => prev === 'DISCONNECTED' ? 'RECONNECTING' : 'CONNECTING');
    
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to server');
      setStatus('CONNECTED');
      setErrorMsg('');
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WSMessage;
        
        switch (message.type) {
          case 'INIT': {
            setGridSize(message.gridSize);
            const blockMap: Record<string, BlockState> = {};
            message.blocks.forEach((b) => {
              blockMap[`${b.x},${b.y}`] = {
                ownerName: b.ownerName,
                ownerColor: b.ownerColor,
              };
            });
            setBlocks(blockMap);
            break;
          }
          case 'UPDATE': {
            const { x, y, ownerName, ownerColor } = message;
            setBlocks((prev) => ({
              ...prev,
              [`${x},${y}`]: { ownerName, ownerColor },
            }));
            break;
          }
          case 'RESET': {
            setBlocks({});
            break;
          }
          case 'STATS': {
            setOnlineUsers(message.onlineUsers);
            break;
          }
          case 'COOLDOWN_START': {
            startCooldown(message.cooldownMs);
            break;
          }
          case 'ERROR': {
            setErrorMsg(message.message);
            // Flash error message, clear after 3 seconds
            setTimeout(() => setErrorMsg(''), 3000);
            break;
          }
          default:
            break;
        }
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    };

    ws.onclose = () => {
      console.log('Connection closed');
      setStatus('DISCONNECTED');
      // Attempt reconnect after 3 seconds
      if (!reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      ws.close();
    };
  }, [url, startCooldown]);

  // Connect on mount
  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    };
  }, [connect]);

  const claimBlock = useCallback((x: number, y: number) => {
    if (status !== 'CONNECTED' || cooldown > 0) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'CLAIM',
        x,
        y,
        name: username,
        color: userColor,
      }));
    }
  }, [status, cooldown, username, userColor]);

  return {
    status,
    gridSize,
    blocks,
    onlineUsers,
    cooldown,
    errorMsg,
    claimBlock,
  };
}
