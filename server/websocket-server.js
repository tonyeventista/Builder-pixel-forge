const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

/**
 * WebSocket Server for Real-time Music Synchronization
 * Provides ultra-low latency sync for music playback across browsers
 */

class MusicSyncServer {
  constructor(port = 8080) {
    this.wss = new WebSocket.Server({ port });
    this.rooms = new Map(); // roomId -> room data
    this.clients = new Map(); // ws -> client info

    console.log(`🎵 Music Sync WebSocket Server running on port ${port}`);
    this.setupServer();
  }

  setupServer() {
    this.wss.on("connection", (ws) => {
      const clientId = uuidv4();
      console.log(`🔗 Client connected: ${clientId}`);

      // Store client info
      this.clients.set(ws, {
        id: clientId,
        roomId: null,
        joinedAt: Date.now(),
      });

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data);
          this.handleMessage(ws, message);
        } catch (error) {
          console.error("Invalid message format:", error);
          this.sendError(ws, "Invalid message format");
        }
      });

      ws.on("close", () => {
        console.log(`🔌 Client disconnected: ${clientId}`);
        this.handleDisconnect(ws);
      });

      ws.on("error", (error) => {
        console.error(`❌ WebSocket error for ${clientId}:`, error);
      });

      // Send connection confirmation
      this.sendMessage(ws, {
        type: "connected",
        clientId,
        serverTime: Date.now(),
      });
    });
  }

  handleMessage(ws, message) {
    const client = this.clients.get(ws);
    if (!client) return;

    switch (message.type) {
      case "join_room":
        this.handleJoinRoom(ws, message.roomId);
        break;

      case "leave_room":
        this.handleLeaveRoom(ws);
        break;

      case "play":
        this.handlePlay(ws, message);
        break;

      case "pause":
        this.handlePause(ws, message);
        break;

      case "seek":
        this.handleSeek(ws, message);
        break;

      case "song_change":
        this.handleSongChange(ws, message);
        break;

      case "sync_request":
        this.handleSyncRequest(ws);
        break;

      case "server_play":
        this.handleServerPlay(ws, message);
        break;

      case "client_pause":
        this.handleClientPause(ws, message);
        break;

      case "client_resume":
        this.handleClientResume(ws, message);
        break;

      case "playback_ended":
        this.handlePlaybackEnded(ws, message);
        break;

      default:
        this.sendError(ws, `Unknown message type: ${message.type}`);
    }
  }

  handleJoinRoom(ws, roomId) {
    if (!roomId) {
      this.sendError(ws, "Room ID is required");
      return;
    }

    const client = this.clients.get(ws);

    // Leave current room if any
    if (client.roomId) {
      this.handleLeaveRoom(ws);
    }

    // Join new room
    client.roomId = roomId;

    if (!this.rooms.has(roomId)) {
      // Create new room
      this.rooms.set(roomId, {
        id: roomId,
        clients: new Set(),
        playbackState: {
          isPlaying: false,
          currentSong: null,
          position: 0,
          startTime: null,
          lastUpdated: Date.now(),
        },
      });
      console.log(`🏠 Created new room: ${roomId}`);
    }

    const room = this.rooms.get(roomId);
    room.clients.add(ws);

    console.log(`🔗 Client ${client.id} joined room ${roomId}`);

    // Send current room state to new client
    this.sendMessage(ws, {
      type: "room_joined",
      roomId,
      playbackState: room.playbackState,
      clientCount: room.clients.size,
    });

    // Also send current server state for immediate sync
    this.sendCurrentServerState(ws, room);

    // Notify other clients in room
    this.broadcastToRoom(
      roomId,
      {
        type: "client_joined",
        clientId: client.id,
        clientCount: room.clients.size,
      },
      ws,
    );
  }

  handleLeaveRoom(ws) {
    const client = this.clients.get(ws);
    if (!client.roomId) return;

    const room = this.rooms.get(client.roomId);
    if (room) {
      room.clients.delete(ws);

      // Notify other clients
      this.broadcastToRoom(client.roomId, {
        type: "client_left",
        clientId: client.id,
        clientCount: room.clients.size,
      });

      // Clean up empty room
      if (room.clients.size === 0) {
        this.rooms.delete(client.roomId);
        console.log(`🗑️ Deleted empty room: ${client.roomId}`);
      }
    }

    client.roomId = null;
  }

  handlePlay(ws, message) {
    const client = this.clients.get(ws);
    if (!client.roomId) return;

    const room = this.rooms.get(client.roomId);
    if (!room) return;

    // Only handle local client pause/resume - don't change server state
    console.log(
      `🎵 Client ${client.id} requested local play - no server state change`,
    );

    // Send current server state to requesting client
    this.sendCurrentServerState(ws, room);
  }

  handlePause(ws, message) {
    const client = this.clients.get(ws);
    if (!client.roomId) return;

    const room = this.rooms.get(client.roomId);
    if (!room) return;

    // Only handle local client pause/resume - don't change server state
    console.log(
      `⏸️ Client ${client.id} requested local pause - no server state change`,
    );

    // Send current server state to requesting client for potential resume sync
    this.sendCurrentServerState(ws, room);
  }

  handleServerPlay(ws, message) {
    // NEW: Only for server-controlled playback (when adding songs)
    const client = this.clients.get(ws);
    if (!client.roomId) return;

    const room = this.rooms.get(client.roomId);
    if (!room) return;

    const serverTime = Date.now();

    // Update room playback state - server authoritative
    room.playbackState = {
      ...room.playbackState,
      isPlaying: true,
      position: message.position || 0,
      startTime: serverTime - (message.position || 0) * 1000,
      lastUpdated: serverTime,
      songId: message.songId,
      triggeredBy: client.id,
    };

    // Broadcast to all clients in room
    this.broadcastToRoom(client.roomId, {
      type: "server_play_sync",
      position: message.position || 0,
      serverTime,
      startTime: room.playbackState.startTime,
      songId: message.songId,
      triggeredBy: client.id,
    });

    console.log(
      `▶️ Server play triggered in room ${client.roomId} at position ${message.position}s`,
    );
  }

  handleSeek(ws, message) {
    const client = this.clients.get(ws);
    if (!client.roomId) return;

    const room = this.rooms.get(client.roomId);
    if (!room) return;

    const serverTime = Date.now();
    const seekPosition = message.position || 0;

    // Update room playback state
    room.playbackState = {
      ...room.playbackState,
      position: seekPosition,
      startTime: room.playbackState.isPlaying
        ? serverTime - seekPosition * 1000
        : null,
      lastUpdated: serverTime,
      triggeredBy: client.id,
    };

    // Broadcast to all clients in room
    this.broadcastToRoom(client.roomId, {
      type: "seek_sync",
      position: seekPosition,
      isPlaying: room.playbackState.isPlaying,
      serverTime,
      startTime: room.playbackState.startTime,
      triggeredBy: client.id,
    });

    console.log(
      `⏭️ Seek triggered in room ${client.roomId} to position ${seekPosition}s`,
    );
  }

  handleSongChange(ws, message) {
    const client = this.clients.get(ws);
    if (!client.roomId) return;

    const room = this.rooms.get(client.roomId);
    if (!room) return;

    const serverTime = Date.now();

    // Update room playback state - auto-start new song on server
    room.playbackState = {
      ...room.playbackState,
      currentSong: message.song,
      position: 0,
      startTime: serverTime, // Auto-start new song
      isPlaying: true,
      lastUpdated: serverTime,
      triggeredBy: client.id,
    };

    // Broadcast to all clients in room
    this.broadcastToRoom(client.roomId, {
      type: "song_change_sync",
      song: message.song,
      serverTime,
      startTime: serverTime,
      triggeredBy: client.id,
    });

    console.log(
      `🎵 Song changed in room ${client.roomId}:`,
      message.song?.title,
    );
  }

  handleClientPause(ws, message) {
    const client = this.clients.get(ws);
    console.log(`⏸️ Client ${client.id} paused locally`);

    // Just acknowledge - no server state change
    this.sendMessage(ws, {
      type: "client_pause_ack",
      clientId: client.id,
      timestamp: Date.now(),
    });
  }

  handleClientResume(ws, message) {
    const client = this.clients.get(ws);
    if (!client.roomId) return;

    const room = this.rooms.get(client.roomId);
    if (!room) return;

    console.log(`▶️ Client ${client.id} resuming - syncing to server time`);

    // Send current server state for resume sync
    this.sendCurrentServerState(ws, room);
  }

  handlePlaybackEnded(ws, message) {
    const client = this.clients.get(ws);
    if (!client.roomId) return;

    const room = this.rooms.get(client.roomId);
    if (!room) return;

    console.log(
      `🏁 Playback ended in room ${client.roomId} - clearing server state`,
    );

    // Clear server playback state
    room.playbackState = {
      ...room.playbackState,
      isPlaying: false,
      currentSong: null,
      position: 0,
      startTime: null,
      lastUpdated: Date.now(),
      triggeredBy: client.id,
    };

    // Broadcast to all clients that playback has ended
    this.broadcastToRoom(client.roomId, {
      type: "playback_ended_sync",
      serverTime: Date.now(),
      triggeredBy: client.id,
    });
  }

  sendCurrentServerState(ws, room) {
    const serverTime = Date.now();
    let currentPosition = room.playbackState.position;

    // Calculate real-time position if server is playing
    if (room.playbackState.isPlaying && room.playbackState.startTime) {
      currentPosition = (serverTime - room.playbackState.startTime) / 1000;
    }

    this.sendMessage(ws, {
      type: "server_state_sync",
      playbackState: {
        ...room.playbackState,
        position: currentPosition,
      },
      serverTime,
      isServerPlaying: room.playbackState.isPlaying,
    });
  }

  handleSyncRequest(ws) {
    const client = this.clients.get(ws);
    if (!client.roomId) return;

    const room = this.rooms.get(client.roomId);
    if (!room) return;

    const serverTime = Date.now();
    let currentPosition = room.playbackState.position;

    // Calculate real-time position if playing
    if (room.playbackState.isPlaying && room.playbackState.startTime) {
      currentPosition = (serverTime - room.playbackState.startTime) / 1000;
    }

    // Send current state to requesting client
    this.sendMessage(ws, {
      type: "sync_response",
      playbackState: {
        ...room.playbackState,
        position: currentPosition,
      },
      serverTime,
    });
  }

  handleDisconnect(ws) {
    this.handleLeaveRoom(ws);
    this.clients.delete(ws);
  }

  broadcastToRoom(roomId, message, excludeWs = null) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.clients.forEach((clientWs) => {
      if (clientWs !== excludeWs && clientWs.readyState === WebSocket.OPEN) {
        this.sendMessage(clientWs, message);
      }
    });
  }

  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendError(ws, error) {
    this.sendMessage(ws, {
      type: "error",
      message: error,
      timestamp: Date.now(),
    });
  }

  // Get server stats
  getStats() {
    return {
      totalRooms: this.rooms.size,
      totalClients: this.clients.size,
      rooms: Array.from(this.rooms.entries()).map(([id, room]) => ({
        id,
        clientCount: room.clients.size,
        isPlaying: room.playbackState.isPlaying,
        currentSong: room.playbackState.currentSong?.title || "None",
      })),
    };
  }
}

// Start server
const server = new MusicSyncServer(process.env.PORT || 8081);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down WebSocket server...");
  server.wss.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

module.exports = MusicSyncServer;
