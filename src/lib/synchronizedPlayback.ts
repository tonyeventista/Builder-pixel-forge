import { database } from "./firebase";
import { ref, set, onValue, off, serverTimestamp } from "firebase/database";
import { WorkspaceData } from "./workspace";

/**
 * Interface for synchronized playback events
 */
export interface PlaybackEvent {
  type: "play" | "pause" | "seek" | "songChange";
  timestamp: number;
  position?: number; // Current playback position in seconds
  songId?: string;
  userId?: string;
}

/**
 * Synchronized playback service using Firebase with server timestamps
 */
export class SynchronizedPlaybackService {
  private listeners: Map<string, () => void> = new Map();
  private serverTimeOffset: number = 0; // Offset between client and server time
  private syncInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.calculateServerTimeOffset();
  }

  /**
   * Calculate server time offset for synchronization
   */
  private async calculateServerTimeOffset(): Promise<void> {
    if (!database) return;

    try {
      const syncRef = ref(database, ".info/serverTimeOffset");
      onValue(syncRef, (snapshot) => {
        this.serverTimeOffset = snapshot.val() || 0;
      });
    } catch (error) {
      console.warn("Failed to sync server time:", error);
    }
  }

  /**
   * Get current server timestamp
   */
  private getServerTime(): number {
    return Date.now() + this.serverTimeOffset;
  }

  /**
   * Start synchronized playback for a room
   */
  async startPlayback(
    workspaceId: string,
    song: any,
    position: number = 0,
  ): Promise<void> {
    if (!database) return;

    const serverTime = this.getServerTime();
    const playbackData = {
      type: "play",
      timestamp: serverTime,
      position,
      songId: song.id,
      songStartTime: serverTime - position * 1000, // Adjust for current position
    };

    try {
      const playbackRef = ref(database, `playback/${workspaceId}`);
      await set(playbackRef, playbackData);
    } catch (error) {
      console.warn("Failed to start synchronized playback:", error);
    }
  }

  /**
   * Pause synchronized playback for a room
   */
  async pausePlayback(
    workspaceId: string,
    currentPosition: number,
  ): Promise<void> {
    if (!database) return;

    const playbackData = {
      type: "pause",
      timestamp: this.getServerTime(),
      position: currentPosition,
    };

    try {
      const playbackRef = ref(database, `playback/${workspaceId}`);
      await set(playbackRef, playbackData);
    } catch (error) {
      console.warn("Failed to pause synchronized playback:", error);
    }
  }

  /**
   * Change song in synchronized playback
   */
  async changeSong(workspaceId: string, newSong: any): Promise<void> {
    if (!database) return;

    const serverTime = this.getServerTime();
    const playbackData = {
      type: "songChange",
      timestamp: serverTime,
      position: 0,
      songId: newSong.id,
      songStartTime: serverTime,
    };

    try {
      const playbackRef = ref(database, `playback/${workspaceId}`);
      await set(playbackRef, playbackData);
    } catch (error) {
      console.warn("Failed to change synchronized song:", error);
    }
  }

  /**
   * Get current synchronized playback position
   */
  calculateCurrentPosition(playbackData: any): number {
    if (!playbackData || playbackData.type === "pause") {
      return playbackData?.position || 0;
    }

    if (playbackData.type === "play" && playbackData.songStartTime) {
      const elapsed =
        (this.getServerTime() - playbackData.songStartTime) / 1000;
      return Math.max(0, elapsed);
    }

    return 0;
  }

  /**
   * Subscribe to synchronized playback events
   */
  subscribeToPlayback(
    workspaceId: string,
    callback: (playbackData: any) => void,
  ): void {
    if (!database) return;

    const playbackRef = ref(database, `playback/${workspaceId}`);
    const unsubscribe = onValue(playbackRef, (snapshot) => {
      const data = snapshot.val();
      callback(data);
    });

    this.listeners.set(workspaceId, () =>
      off(playbackRef, "value", unsubscribe),
    );
  }

  /**
   * Unsubscribe from playback events
   */
  unsubscribeFromPlayback(workspaceId: string): void {
    const unsubscribe = this.listeners.get(workspaceId);
    if (unsubscribe) {
      unsubscribe();
      this.listeners.delete(workspaceId);
    }
  }

  /**
   * Start periodic synchronization check
   */
  startSyncCheck(
    workspaceId: string,
    syncCallback: (position: number) => void,
  ): void {
    this.stopSyncCheck(); // Clear any existing interval

    this.syncInterval = setInterval(() => {
      if (!database) return;

      const playbackRef = ref(database, `playback/${workspaceId}`);
      onValue(
        playbackRef,
        (snapshot) => {
          const data = snapshot.val();
          if (data) {
            const currentPosition = this.calculateCurrentPosition(data);
            syncCallback(currentPosition);
          }
        },
        { onlyOnce: true },
      );
    }, 1000); // Sync every second
  }

  /**
   * Stop periodic synchronization check
   */
  stopSyncCheck(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Check if there's existing playback in the room (for new joiners)
   */
  async checkExistingPlayback(workspaceId: string): Promise<any | null> {
    if (!database) return null;

    try {
      const playbackRef = ref(database, `playback/${workspaceId}`);
      return new Promise((resolve) => {
        onValue(
          playbackRef,
          (snapshot) => {
            const data = snapshot.val();
            resolve(data);
          },
          { onlyOnce: true },
        );
      });
    } catch (error) {
      console.warn("Failed to check existing playback:", error);
      return null;
    }
  }

  /**
   * Clean up all subscriptions
   */
  cleanup(): void {
    this.listeners.forEach((unsubscribe) => unsubscribe());
    this.listeners.clear();
    this.stopSyncCheck();
  }
}

// Export singleton instance
export const synchronizedPlayback = new SynchronizedPlaybackService();
