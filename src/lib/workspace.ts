/**
 * Generate random 6-character string for workspace ID
 */
export const generateRandomId = (): string => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Create workspace ID from name + random characters
 */
export const createWorkspaceId = (workspaceName: string): string => {
  const sanitizedName = workspaceName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") // Remove special characters
    .substring(0, 20); // Limit length

  const randomId = generateRandomId();
  return `${sanitizedName}-${randomId}`;
};

/**
 * Validate workspace ID format
 */
export const isValidWorkspaceId = (id: string): boolean => {
  const pattern = /^[a-z0-9]+-[A-Z0-9]{6}$/;
  return pattern.test(id);
};

/**
 * Extract workspace name from ID
 */
export const getWorkspaceNameFromId = (id: string): string => {
  const parts = id.split("-");
  return parts[0] || "Unknown";
};

/**
 * Workspace data interface with synchronized playback support
 */
export interface WorkspaceData {
  id: string;
  name: string;
  createdAt: number;
  currentSong: any | null;
  queue: any[];
  status: "playing" | "paused" | "loading" | "error";
  // Synchronized playback fields
  playbackStartTime?: number; // Server timestamp when playback started
  songStartTime?: number; // Timestamp when current song started
  currentPosition?: number; // Current playback position in seconds
  lastSync?: number; // Last synchronization timestamp
}

/**
 * Save workspace data to localStorage
 */
export const saveWorkspaceData = (
  workspaceId: string,
  data: WorkspaceData,
): void => {
  try {
    localStorage.setItem(`workspace-${workspaceId}`, JSON.stringify(data));
  } catch (error) {
    console.warn("Failed to save workspace data:", error);
  }
};

/**
 * Load workspace data from localStorage
 */
export const loadWorkspaceData = (
  workspaceId: string,
): WorkspaceData | null => {
  try {
    const data = localStorage.getItem(`workspace-${workspaceId}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.warn("Failed to load workspace data:", error);
    return null;
  }
};

/**
 * Create new workspace
 */
export const createWorkspace = (name: string): WorkspaceData => {
  const id = createWorkspaceId(name);
  const workspaceData: WorkspaceData = {
    id,
    name,
    createdAt: Date.now(),
    currentSong: null,
    queue: [],
    status: "paused",
  };

  saveWorkspaceData(id, workspaceData);
  return workspaceData;
};
