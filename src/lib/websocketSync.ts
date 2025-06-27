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

  constructor(url: string = "ws://localhost:8080") {
    this.url = url;
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
          console.error("❌ WebSocket error:", error);
          this.isConnecting = false;
          reject(error);
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
   * Sync play action across all clients
   */
  syncPlay(position: number = 0, songId?: string) {
    this.send({
      type: "play",
      position,
      songId,
      clientTime: Date.now(),
    });
  }

  /**
   * Sync pause action across all clients
   */
  syncPause(position: number = 0) {
    this.send({
      type: "pause",
      position,
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
    if (!playbackState.isPlaying || !playbackState.startTime) {
      return playbackState.position;
    }

    const elapsed = (this.getServerTime() - playbackState.startTime) / 1000;
    return Math.max(0, elapsed);
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

    // Log important events
    if (
      ["play_sync", "pause_sync", "seek_sync", "song_change_sync"].includes(
        message.type,
      )
    ) {
      console.log(`🎵 Sync event: ${message.type}`, {
        position: message.position,
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
}

// Export singleton instance
export const wsSync = new WebSocketMusicSync();
