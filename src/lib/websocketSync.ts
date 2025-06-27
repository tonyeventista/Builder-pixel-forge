/**
 * WebSocket client for ultra-fast music synchronization
 * Provides sub-second sync accuracy for music playback
 */

export interface PlaybackState {
  isPlaying: boolean;
  currentSong: any | null;
  position: number;
  startTime: number | null;
  lastUpdated: number;
  songId?: string;
}

export interface SyncMessage {
  type: string;
  [key: string]: any;
}

export type SyncCallback = (message: SyncMessage) => void;

export class WebSocketMusicSync {
  private ws: WebSocket | null = null;
  private url: string;
  private roomId: string | null = null;
  private callbacks: Map<string, SyncCallback[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private serverTimeOffset = 0;

  // Polling state
  private pollingInterval: NodeJS.Timeout | null = null;
  private requestIdCounter = 0;

  constructor(url: string = "") {
    // Auto-detect WebSocket URL based on environment
    if (!url) {
      // In development, use the Vite proxy endpoint
      if (import.meta.env.DEV) {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = window.location.host; // includes port
        this.url = `${protocol}//${host}/ws`;
        console.log("🔗 WebSocket URL (dev proxy):", this.url);
      } else {
        // In production, you'll need to configure this for your deployment
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host = window.location.host;
        this.url = `${protocol}//${host}/ws`;
        console.log("🔗 WebSocket URL (production):", this.url);
      }
    } else {
      this.url = url;
    }
    this.setupEventHandlers();
  }

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      if (this.isConnecting) {
        reject(new Error("Already connecting"));
        return;
      }

      this.isConnecting = true;

      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log("🔗 WebSocket connected to music sync server");
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error("Failed to parse WebSocket message:", error);
          }
        };

        this.ws.onclose = (event) => {
          console.log("🔌 WebSocket disconnected:", event.code, event.reason);
          this.isConnecting = false;
          this.handleDisconnect();
        };

        this.ws.onerror = (error) => {
          console.error("❌ WebSocket error - trying to connect to:", this.url);
          console.error("Error details:", error);
          this.isConnecting = false;
          reject(
            new Error(`Failed to connect to WebSocket server at ${this.url}`),
          );
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    this.stopPolling();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Join a music room
   */
  async joinRoom(roomId: string): Promise<void> {
    await this.ensureConnected();
    this.roomId = roomId;
    this.send({
      type: "join_room",
      roomId,
    });
  }

  /**
   * Leave current room
   */
  leaveRoom() {
    if (this.roomId) {
      this.send({
        type: "leave_room",
      });
      this.roomId = null;
    }
  }

  /**
   * Request local play (client-side only)
   */
  requestClientPlay() {
    this.send({
      type: "play",
      clientTime: Date.now(),
    });
  }

  /**
   * Request local pause (client-side only)
   */
  requestClientPause() {
    this.send({
      type: "client_pause",
      clientTime: Date.now(),
    });
  }

  /**
   * Request resume and sync to server time
   */
  requestClientResume() {
    this.send({
      type: "client_resume",
      clientTime: Date.now(),
    });
  }

  /**
   * Server-controlled play (when adding songs)
   */
  serverPlay(position: number = 0, songId?: string) {
    this.send({
      type: "server_play",
      position,
      songId,
      clientTime: Date.now(),
    });
  }

  /**
   * Sync seek action across all clients
   */
  syncSeek(position: number) {
    this.send({
      type: "seek",
      position,
      clientTime: Date.now(),
    });
  }

  /**
   * Sync song change across all clients
   */
  syncSongChange(song: any) {
    this.send({
      type: "song_change",
      song,
      clientTime: Date.now(),
    });
  }

  /**
   * Request current sync state from server
   */
  requestSync() {
    this.send({
      type: "sync_request",
    });
  }

  /**
   * Subscribe to sync events
   */
  on(eventType: string, callback: SyncCallback) {
    if (!this.callbacks.has(eventType)) {
      this.callbacks.set(eventType, []);
    }
    this.callbacks.get(eventType)!.push(callback);
  }

  /**
   * Unsubscribe from sync events
   */
  off(eventType: string, callback: SyncCallback) {
    const callbacks = this.callbacks.get(eventType);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Get current server time (with offset correction)
   */
  getServerTime(): number {
    return Date.now() + this.serverTimeOffset;
  }

  /**
   * Calculate current playback position based on server time
   */
  calculateCurrentPosition(playbackState: PlaybackState): number {
    // If server is not playing, return server position
    if (!playbackState.isPlaying || !playbackState.startTime) {
      return playbackState.position;
    }

    // Calculate server position
    const elapsed = (this.getServerTime() - playbackState.startTime) / 1000;
    return Math.max(0, elapsed);
  }

  /**
   * Request current room state from server
   */
  requestRoomState(): Promise<any> {
    const requestId = ++this.requestIdCounter;

    return new Promise((resolve, reject) => {
      // Set up one-time listener for response
      const handleResponse = (message: SyncMessage) => {
        if (
          message.type === "room_state_response" &&
          message.requestId === requestId
        ) {
          this.off("room_state_response", handleResponse);
          resolve(message);
        }
      };

      this.on("room_state_response", handleResponse);

      // Send request
      this.send({
        type: "get_room_state",
        requestId,
        clientTime: Date.now(),
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        this.off("room_state_response", handleResponse);
        reject(new Error("Room state request timeout"));
      }, 5000);
    });
  }

  /**
   * Add song to server
   */
  addSongToServer(song: any, setAsCurrent: boolean = false): Promise<any> {
    return new Promise((resolve, reject) => {
      // Set up one-time listener for response
      const handleResponse = (message: SyncMessage) => {
        if (message.type === "song_added_response") {
          this.off("song_added_response", handleResponse);
          resolve(message);
        }
      };

      this.on("song_added_response", handleResponse);

      // Send request
      this.send({
        type: "add_song",
        song,
        setAsCurrent,
        clientTime: Date.now(),
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        this.off("song_added_response", handleResponse);
        reject(new Error("Add song request timeout"));
      }, 5000);
    });
  }

  /**
   * Start polling for room state every 10 seconds
   */
  startPolling(callback: (roomState: any) => void) {
    this.stopPolling(); // Clear any existing polling

    const poll = async () => {
      try {
        const roomState = await this.requestRoomState();
        callback(roomState);
      } catch (error) {
        console.warn("Polling failed:", error);
      }
    };

    // Poll immediately
    poll();

    // Then poll every 10 seconds
    this.pollingInterval = setInterval(poll, 10000);
    console.log("🕐 Started polling server every 10 seconds");
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log("⏹️ Stopped polling");
    }
  }

  /**
   * Calculate position based on server timestamp
   */
  calculateServerPosition(startTime: number, serverTime: number): number {
    if (!startTime) return 0;
    return Math.max(0, (Date.now() + this.serverTimeOffset - startTime) / 1000);
  }

  private setupEventHandlers() {
    // Handle page visibility changes
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && this.roomId) {
        // Page became visible - request sync to catch up
        setTimeout(() => this.requestSync(), 100);
      }
    });

    // Handle online/offline events
    window.addEventListener("online", () => {
      console.log("🌐 Network restored - reconnecting...");
      this.reconnect();
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    await this.connect();
  }

  private handleMessage(message: SyncMessage) {
    // Calculate server time offset for synchronization
    if (message.serverTime) {
      const roundTripTime = Date.now() - (message.clientTime || Date.now());
      this.serverTimeOffset =
        message.serverTime - Date.now() + roundTripTime / 2;
    }

    // Emit to listeners
    const callbacks = this.callbacks.get(message.type);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(message);
        } catch (error) {
          console.error("Error in sync callback:", error);
        }
      });
    }

    // Handle server state sync messages
    if (message.type === "server_state_sync") {
      console.log(`🎵 Server state sync:`, {
        isServerPlaying: message.isServerPlaying,
        position: message.playbackState?.position,
        serverTime: message.serverTime,
      });
    }

    // Handle client pause acknowledgments
    if (message.type === "client_pause_ack") {
      console.log(`✅ Client pause acknowledged by server`);
    }

    // Log important server events
    if (
      [
        "server_play_sync",
        "seek_sync",
        "song_change_sync",
        "server_state_sync",
      ].includes(message.type)
    ) {
      console.log(`🎵 Server sync event: ${message.type}`, {
        position: message.position || message.playbackState?.position,
        serverTime: message.serverTime,
        offset: this.serverTimeOffset,
      });
    }
  }

  private handleDisconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
      console.log(
        `🔄 Attempting to reconnect in ${delay}ms... (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`,
      );

      setTimeout(() => {
        this.reconnectAttempts++;
        this.reconnect();
      }, delay);
    } else {
      console.error("❌ Max reconnection attempts reached");
      this.emit("max_reconnect_attempts");
    }
  }

  private async reconnect() {
    try {
      await this.connect();
      if (this.roomId) {
        await this.joinRoom(this.roomId);
      }
    } catch (error) {
      console.error("Reconnection failed:", error);
    }
  }

  private send(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket not connected - message not sent:", message);
    }
  }

  private emit(eventType: string, data?: any) {
    const callbacks = this.callbacks.get(eventType);
    if (callbacks) {
      callbacks.forEach((callback) => callback({ type: eventType, ...data }));
    }
  }

  /**
   * Send raw message (public method for special cases)
   */
  sendMessage(message: any) {
    this.send(message);
  }
}

// Export singleton instance
export const wsSync = new WebSocketMusicSync();
