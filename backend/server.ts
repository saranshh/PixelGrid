import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { initDb, getBlocks, claimBlock, clearAllBlocks, Block } from './db.js';
 
const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

// Configuration
const GRID_SIZE = 100; // 100x100 grid
const COOLDOWN_MS = 1500; // 1.5 seconds cooldown

// Map to track client cooldowns by connection
const clientCooldowns = new WeakMap<WebSocket, number>();

// Define WS message shapes
type ServerMessage =
  | { type: 'INIT'; gridSize: number; blocks: Block[] }
  | { type: 'UPDATE'; x: number; y: number; ownerName: string; ownerColor: string }
  | { type: 'RESET' }
  | { type: 'STATS'; onlineUsers: number }
  | { type: 'COOLDOWN_START'; cooldownMs: number }
  | { type: 'ERROR'; message: string };

interface ClaimRequestMessage {
  type: 'CLAIM';
  x: number;
  y: number;
  name: string;
  color: string;
}

// Broadcast a message to all connected clients
function broadcast(message: ServerMessage): void {
  const payload = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Broadcast current online user count
function broadcastUserCount(): void {
  broadcast({
    type: 'STATS',
    onlineUsers: wss.clients.size,
  });
}

wss.on('connection', async (ws: WebSocket) => {
  console.log(`New client connected. Total clients: ${wss.clients.size}`);

  // Send initial grid state and user count
  try {
    const activeBlocks = await getBlocks();
    ws.send(JSON.stringify({
      type: 'INIT',
      gridSize: GRID_SIZE,
      blocks: activeBlocks,
    }));
    
    // Broadcast updated stats to all
    broadcastUserCount();
  } catch (error) {
    console.error('Error during client initialization:', error);
  }

  ws.on('message', async (message: string) => {
    try {
      const data = JSON.parse(message) as Partial<ClaimRequestMessage>;

      if (data.type === 'CLAIM') {
        const { x, y, name, color } = data;

        // 1. Basic validation
        if (
          typeof x !== 'number' || x < 0 || x >= GRID_SIZE ||
          typeof y !== 'number' || y < 0 || y >= GRID_SIZE ||
          !name || typeof name !== 'string' ||
          !color || typeof color !== 'string'
        ) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid claim data.' }));
          return;
        }

        // 2. Cooldown check
        const now = Date.now();
        const lastClaim = clientCooldowns.get(ws) || 0;
        if (now - lastClaim < COOLDOWN_MS) {
          const remaining = COOLDOWN_MS - (now - lastClaim);
          ws.send(JSON.stringify({
            type: 'ERROR',
            message: `Cooldown active. Wait ${Math.ceil(remaining / 1000)}s.`,
          }));
          return;
        }

        // Update cooldown
        clientCooldowns.set(ws, now);

        // 3. Persist claim
        await claimBlock(x, y, name, color);

        // 4. Broadcast the update to everyone
        broadcast({
          type: 'UPDATE',
          x,
          y,
          ownerName: name,
          ownerColor: color,
        });

        // 5. Send success response back to the client to confirm cooldown started
        ws.send(JSON.stringify({
          type: 'COOLDOWN_START',
          cooldownMs: COOLDOWN_MS,
        }));
      }
    } catch (err) {
      console.error('Error processing message:', err);
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Malformed message.' }));
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected. Total clients: ${wss.clients.size}`);
    broadcastUserCount();
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// API Routes
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', clientsConnected: wss.clients.size });
});

app.post('/api/reset', async (req: Request, res: Response) => {
  try {
    await clearAllBlocks();
    broadcast({ type: 'RESET' });
    res.json({ status: 'Success', message: 'Grid cleared.' });
  } catch (error: any) {
    res.status(500).json({ status: 'Error', message: error.message });
  }
});

const PORT = process.env.PORT || 3001;

// Initialize Postgres Database before starting listening
initDb().then(() => {
  server.listen(PORT, () => {
    console.log(`Backend server listening on port ${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database. Server shutdown.', err);
  process.exit(1);
});
