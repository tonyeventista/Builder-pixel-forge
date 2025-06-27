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

      case "get_room_state":
        this.handleGetRoomState(ws, message);
        break;

      case "add_song":
        this.handleAddSong(ws, message);
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
        queue: [], // Add queue to room
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

    console.log(`🏁 Playback ended in room ${client.roomId} - checking queue`);

    // Check if there are more songs in queue
    if (room.queue && room.queue.length > 0) {
      // Play next song from queue
      const nextSong = room.queue.shift();
      const serverTime = Date.now();

      room.playbackState = {
        ...room.playbackState,
        currentSong: nextSong,
        position: 0,
        startTime: serverTime,
        isPlaying: true,
        lastUpdated: serverTime,
        triggeredBy: "server",
      };

      console.log(`🎵 Auto-playing next song: ${nextSong.title}`);

      // Broadcast new song to all clients
      this.broadcastToRoom(client.roomId, {
        type: "new_song_notification",
        song: nextSong,
        startTime: serverTime,
        serverTime: serverTime,
      });
    } else {
      // No more songs - go to idle state
      room.playbackState = {
        ...room.playbackState,
        isPlaying: false,
        currentSong: null,
        position: 0,
        startTime: null,
        lastUpdated: Date.now(),
        triggeredBy: client.id,
      };

      console.log(`💤 Room ${client.roomId} is now idle - no more songs`);
    }
  }

  handleGetRoomState(ws, message) {
    const client = this.clients.get(ws);
    if (!client.roomId) return;

    const room = this.rooms.get(client.roomId);
    if (!room) return;

    const serverTime = Date.now();
    let currentPosition = 0;

    // Calculate current position if playing
    if (room.playbackState.isPlaying && room.playbackState.startTime) {
      currentPosition = Math.max(
        0,
        (serverTime - room.playbackState.startTime) / 1000,
      );
    }

    // Send complete room state
    this.sendMessage(ws, {
      type: "room_state_response",
      currentSong: room.playbackState.currentSong,
      queue: room.queue || [],
      isPlaying: room.playbackState.isPlaying,
      position: currentPosition,
      startTime: room.playbackState.startTime,
      serverTime: serverTime,
      requestId: message.requestId, // For tracking requests
    });

    console.log(
      `📡 Sent room state to client ${client.id}: ${room.playbackState.currentSong?.title || "No song"}`,
    );
  }

  handleAddSong(ws, message) {
    const client = this.clients.get(ws);
    if (!client.roomId) return;

    const room = this.rooms.get(client.roomId);
    if (!room) return;

    const { song, setAsCurrent } = message;
    const serverTime = Date.now();

    // Initialize queue if not exists
    if (!room.queue) {
      room.queue = [];
    }

    if (setAsCurrent || !room.playbackState.currentSong) {
      // Set as current song (server was idle or force set)
      const wasIdle = !room.playbackState.currentSong;

      room.playbackState = {
        ...room.playbackState,
        currentSong: song,
        position: 0,
        startTime: serverTime,
        isPlaying: true,
        lastUpdated: serverTime,
        triggeredBy: client.id,
      };

      console.log(
        `🎵 ${wasIdle ? "Server was idle -" : ""} Set new current song: ${song.title}`,
      );

      // If server was idle, broadcast to all clients
      if (wasIdle) {
        this.broadcastToRoom(client.roomId, {
          type: "new_song_notification",
          song: song,
          startTime: serverTime,
          serverTime: serverTime,
          wasIdle: true,
        });
      }
    } else {
      // Add to queue
      room.queue.push(song);
      console.log(
        `📝 Added to queue: ${song.title} (queue length: ${room.queue.length})`,
      );
    }

    // Send confirmation
    this.sendMessage(ws, {
      type: "song_added_response",
      success: true,
      song: song,
      setAsCurrent: setAsCurrent || !room.playbackState.currentSong,
      queueLength: room.queue.length,
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
