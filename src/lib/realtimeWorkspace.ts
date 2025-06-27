import { database } from "./firebase";
import { ref, set, onValue, off, push } from "firebase/database";
import { WorkspaceData } from "./workspace";

/**
 * Real-time workspace service using Firebase
 */
export class RealtimeWorkspaceService {
  private listeners: Map<string, () => void> = new Map();

  /**
   * Save workspace data to Firebase
   */
  async saveWorkspace(workspaceId: string, data: WorkspaceData): Promise<void> {
    if (!database) {
      // Fallback to localStorage if Firebase unavailable
      try {
        localStorage.setItem(`workspace-${workspaceId}`, JSON.stringify(data));
      } catch (error) {
        console.warn("Failed to save to localStorage:", error);
      }
      return;
    }

    try {
      const workspaceRef = ref(database, `workspaces/${workspaceId}`);
      await set(workspaceRef, {
        ...data,
        lastUpdated: Date.now(),
      });
    } catch (error) {
      console.warn("Failed to save to Firebase, using localStorage:", error);
      localStorage.setItem(`workspace-${workspaceId}`, JSON.stringify(data));
    }
  }

  /**
   * Subscribe to workspace changes
   */
  subscribeToWorkspace(
    workspaceId: string,
    callback: (data: WorkspaceData | null) => void,
  ): void {
    if (!database) {
      // Fallback: load from localStorage once
      try {
        const data = localStorage.getItem(`workspace-${workspaceId}`);
        callback(data ? JSON.parse(data) : null);
      } catch (error) {
        callback(null);
      }
      return;
    }

    try {
      const workspaceRef = ref(database, `workspaces/${workspaceId}`);

      const unsubscribe = onValue(workspaceRef, (snapshot) => {
        const data = snapshot.val();
        callback(data || null);
      });

      // Store unsubscribe function
      this.listeners.set(workspaceId, unsubscribe);
    } catch (error) {
      console.warn(
        "Failed to subscribe to Firebase, using localStorage:",
        error,
      );
      try {
        const data = localStorage.getItem(`workspace-${workspaceId}`);
        callback(data ? JSON.parse(data) : null);
      } catch (localError) {
        callback(null);
      }
    }
  }

  /**
   * Unsubscribe from workspace
   */
  unsubscribeFromWorkspace(workspaceId: string): void {
    if (!database) return;

    const unsubscribe = this.listeners.get(workspaceId);
    if (unsubscribe) {
      try {
        const workspaceRef = ref(database, `workspaces/${workspaceId}`);
        off(workspaceRef);
      } catch (error) {
        console.warn("Failed to unsubscribe:", error);
      }
      this.listeners.delete(workspaceId);
    }
  }

  /**
   * Add song to workspace queue (real-time)
   */
  async addSongToWorkspace(workspaceId: string, song: any): Promise<void> {
    if (!database) return;

    try {
      const songsRef = ref(database, `workspaces/${workspaceId}/queue`);
      await push(songsRef, song);
    } catch (error) {
      console.warn("Failed to add song via Firebase:", error);
    }
  }

  /**
   * Update current playing song
   */
  async updateCurrentSong(workspaceId: string, song: any): Promise<void> {
    if (!database) return;

    try {
      const currentSongRef = ref(
        database,
        `workspaces/${workspaceId}/currentSong`,
      );
      await set(currentSongRef, song);
    } catch (error) {
      console.warn("Failed to update current song:", error);
    }
  }

  /**
   * Update playback status
   */
  async updateStatus(workspaceId: string, status: string): Promise<void> {
    if (!database) return;

    try {
      const statusRef = ref(database, `workspaces/${workspaceId}/status`);
      await set(statusRef, status);
    } catch (error) {
      console.warn("Failed to update status:", error);
    }
  }

  /**
   * Cleanup all listeners
   */
  cleanup(): void {
    this.listeners.forEach((unsubscribe, workspaceId) => {
      this.unsubscribeFromWorkspace(workspaceId);
    });
    this.listeners.clear();
  }
}

// Export singleton instance
export const realtimeService = new RealtimeWorkspaceService();
