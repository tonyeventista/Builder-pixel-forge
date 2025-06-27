import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { SimpleYouTubePlayer } from "@/components/SimpleYouTubePlayer";
import { SynchronizedYouTubePlayer } from "@/components/SynchronizedYouTubePlayer";
import {
  isValidYouTubeUrl,
  normalizeYouTubeUrl,
  extractYouTubeVideoId,
} from "@/lib/youtube";
import {
  WorkspaceData,
  loadWorkspaceData,
  saveWorkspaceData,
  getWorkspaceNameFromId,
  isValidWorkspaceId,
} from "@/lib/workspace";
import { realtimeService } from "@/lib/realtimeWorkspace";
import { synchronizedPlayback } from "@/lib/synchronizedPlayback";
import { wsSync } from "@/lib/websocketSync";

interface Song {
  id: string;
  title: string;
  url: string;
  videoId?: string;
}

const WorkspacePage = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();

  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [queue, setQueue] = useState<Song[]>([]);
  const [status, setStatus] = useState<
    "playing" | "paused" | "loading" | "error"
  >("paused");
  const [inputUrl, setInputUrl] = useState("");
  const [error, setError] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [hasSyncedFromFirebase, setHasSyncedFromFirebase] = useState(false);

  // Synchronized playback state
  const [syncedPosition, setSyncedPosition] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState(0);
  const [isHost, setIsHost] = useState(false); // True if this user controls playback
  const [useWebSocketSync, setUseWebSocketSync] = useState(true); // Enable WebSocket for ultra-fast sync
  const [wsConnected, setWsConnected] = useState(false);

  // Helper function to fetch YouTube video title
  const fetchYouTubeTitle = async (
    videoId: string,
  ): Promise<{ title: string; isValid: boolean }> => {
    // Validate videoId format before making API calls
    if (!videoId || videoId.length !== 11) {
      return { title: `Video ${videoId}`, isValid: false };
    }

    try {
      // Use YouTube oEmbed API to get video title
      const response = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      );

      if (response.ok) {
        const data = await response.json();
        if (data.title) {
          return { title: data.title, isValid: true };
        }
      } else if (response.status === 400 || response.status === 404) {
        // Video not found or bad request
        console.warn(
          `YouTube API returned ${response.status} for video ${videoId}`,
        );
        return { title: `Video ${videoId}`, isValid: false };
      }
    } catch (error) {
      console.warn("YouTube oEmbed failed:", error);
    }

    // Try noembed.com as fallback
    try {
      const response = await fetch(
        `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`,
      );

      if (response.ok) {
        const data = await response.json();
        if (data.title && !data.error) {
          return { title: data.title, isValid: true };
        }
      } else if (response.status === 400 || response.status === 404) {
        console.warn(
          `Fallback API returned ${response.status} for video ${videoId}`,
        );
      }
    } catch (fallbackError) {
      console.warn("Fallback API failed:", fallbackError);
    }

    // If both APIs fail, assume invalid
    return { title: `Video ${videoId}`, isValid: false };
  };

  // Helper function to format video titles
  const formatVideoTitle = (
    title: string | undefined,
    videoId?: string,
  ): string => {
    if (!title || typeof title !== "string") {
      return `🎵 Loading...`;
    }
    if (title.startsWith("Video ") && videoId) {
      return `���� Loading...`;
    }
    return title;
  };

  // WebSocket initialization function
  const initializeWebSocketSync = async () => {
    try {
      console.log("🔗 Connecting to WebSocket sync server...");
      await wsSync.connect();
      setWsConnected(true);

      // Join room
      await wsSync.joinRoom(workspaceId);

      // Setup event handlers
      wsSync.on("play_sync", (message) => {
        console.log("📡 WebSocket play sync:", message);
        const currentPos = wsSync.calculateCurrentPosition({
          isPlaying: true,
          position: message.position,
          startTime: message.startTime,
          currentSong: null,
          lastUpdated: message.serverTime,
        });
        setSyncedPosition(currentPos);
        setStatus("playing");
      });

      wsSync.on("pause_sync", (message) => {
        console.log("📡 WebSocket pause sync:", message);
        setSyncedPosition(message.position);
        setStatus("paused");
      });

      wsSync.on("seek_sync", (message) => {
        console.log("📡 WebSocket seek sync:", message);
        setSyncedPosition(message.position);
        setStatus(message.isPlaying ? "playing" : "paused");
      });

      wsSync.on("song_change_sync", (message) => {
        console.log("📡 WebSocket song change:", message);
        if (message.song) {
          setCurrentSong(message.song);
          setSyncedPosition(0);
          setStatus("playing");
        }
      });

      wsSync.on("room_joined", (message) => {
        console.log("🏠 Joined WebSocket room:", message);
        if (message.playbackState && message.playbackState.currentSong) {
          // Sync to existing playback state
          setCurrentSong(message.playbackState.currentSong);
          const currentPos = wsSync.calculateCurrentPosition(
            message.playbackState,
          );
          setSyncedPosition(currentPos);
          setStatus(message.playbackState.isPlaying ? "playing" : "paused");
        }
      });

      wsSync.on("error", (message) => {
        console.error("❌ WebSocket error:", message);
        setWsConnected(false);
      });

      console.log("✅ WebSocket sync initialized");
    } catch (error) {
      console.warn(
        "⚠️ WebSocket connection failed, falling back to Firebase:",
        error,
      );
      setUseWebSocketSync(false);
      setWsConnected(false);
    }
  };

  // Initialize workspace on mount
  useEffect(() => {
    if (!workspaceId || !isValidWorkspaceId(workspaceId)) {
      navigate("/");
      return;
    }

    // Initialize workspace immediately to avoid loading state
    const initializeWorkspace = () => {
      console.log("Initializing workspace:", workspaceId);

      // Create initial workspace state immediately
      const initialWorkspace: WorkspaceData = {
        id: workspaceId,
        name: getWorkspaceNameFromId(workspaceId),
        createdAt: Date.now(),
        currentSong: null,
        queue: [],
        status: "paused",
      };

      setWorkspace(initialWorkspace);
      setIsInitializing(false);
      console.log("Workspace initialized:", initialWorkspace);
    };

    // Initialize immediately
    initializeWorkspace();

    // Setup real-time sync to get updates from other users
    try {
      console.log("Setting up real-time sync for workspace:", workspaceId);
      realtimeService.subscribeToWorkspace(workspaceId, (data) => {
        console.log("Received real-time data:", data);
        if (data) {
          // Firebase has existing data - update to sync with other users
          console.log("Syncing with existing workspace data");
          setWorkspace(data);
          setCurrentSong(data.currentSong);
          setQueue(data.queue || []);
          setStatus(data.status || "paused");
          setHasSyncedFromFirebase(true);
        }
      });

      // Set timeout to allow Firebase sync, then enable saving if no data received
      setTimeout(() => {
        console.log("Timeout reached - enabling saves if not already synced");
        setHasSyncedFromFirebase(true);
      }, 2000);
    } catch (error) {
      console.warn(
        "Real-time sync failed - workspace already initialized locally",
        error,
      );
      // Workspace is already initialized above, so we don't need to do anything
      // The app will continue to work with the local workspace state
    }

    // Setup WebSocket sync if enabled
    if (useWebSocketSync) {
      initializeWebSocketSync();
    }

    // Setup synchronized playback subscription (Firebase fallback)
    synchronizedPlayback.subscribeToPlayback(workspaceId, (playbackData) => {
      if (playbackData) {
        const currentPos =
          synchronizedPlayback.calculateCurrentPosition(playbackData);
        setSyncedPosition(currentPos);
        setLastSyncTime(Date.now());

        console.log("Sync update:", {
          type: playbackData.type,
          position: currentPos,
          songId: playbackData.songId,
        });

        // Update playback status based on server state - always auto-play for joining users
        if (playbackData.type === "play") {
          setStatus("playing");
          console.log("Auto-playing for joining user at position:", currentPos);
        } else if (playbackData.type === "pause") {
          setStatus("paused");
        } else if (playbackData.type === "songChange") {
          // Handle song changes from other users - auto-play new songs
          setStatus("playing");
          setSyncedPosition(0);
          console.log("Auto-playing new song from other user");
        }
      } else if (currentSong && status === "loading") {
        // No existing playback data but we have a current song
        // Auto-start playing for the first user
        console.log("First user with song - auto-starting playback");
        setTimeout(async () => {
          if (workspaceId && currentSong) {
            try {
              await synchronizedPlayback.startPlayback(
                workspaceId,
                currentSong,
                0,
              );
              setStatus("playing");
              setSyncedPosition(0);
            } catch (error) {
              console.warn("Failed to auto-start playback:", error);
              setStatus("playing");
            }
          }
        }, 1000); // Give player time to initialize
      }
    });

    return () => {
      try {
        realtimeService.unsubscribeFromWorkspace(workspaceId);
        synchronizedPlayback.unsubscribeFromPlayback(workspaceId);
        synchronizedPlayback.stopSyncCheck();

        // Cleanup WebSocket
        if (useWebSocketSync) {
          wsSync.leaveRoom();
          wsSync.disconnect();
        }
      } catch (error) {
        // Silent cleanup
      }
    };
  }, [workspaceId, navigate]);

  // Save workspace data when state changes (but not during initialization or before sync)
  useEffect(() => {
    if (workspace && workspaceId && !isInitializing && hasSyncedFromFirebase) {
      const updatedWorkspace: WorkspaceData = {
        ...workspace,
        currentSong,
        queue,
        status,
        lastUpdated: Date.now(),
      };

      saveWorkspaceData(workspaceId, updatedWorkspace);

      try {
        console.log(
          "Saving workspace to Firebase:",
          workspaceId,
          updatedWorkspace,
        );
        realtimeService.saveWorkspace(workspaceId, updatedWorkspace);
      } catch (error) {
        console.warn("Real-time sync failed, using localStorage only", error);
      }
    }
  }, [
    workspace,
    workspaceId,
    currentSong,
    queue,
    status,
    isInitializing,
    hasSyncedFromFirebase,
  ]);

  const addToQueue = async () => {
    const trimmedUrl = inputUrl.trim();

    if (!trimmedUrl || !isValidYouTubeUrl(trimmedUrl)) {
      setError("Vui lòng nhập URL YouTube hợp lệ");
      return;
    }

    const normalizedUrl = normalizeYouTubeUrl(trimmedUrl);
    const videoId = extractYouTubeVideoId(normalizedUrl);

    if (!videoId) {
      setError("Không thể trích xuất video ID");
      return;
    }

    // Check queue limit (maximum 10 songs)
    if (currentSong && queue.length >= 10) {
      setError("Playlist đã đạt giới hạn tối đa 10 bài hát");
      return;
    }

    // Show validation status
    setError("Đang kiểm tra...");

    try {
      // Create item with temporary title first
      const newItem: Song = {
        id: Date.now().toString(),
        title: `🎵 Đang tải...`,
        url: normalizedUrl,
        videoId,
      };

      if (!currentSong) {
        setStatus("loading");
        setCurrentSong(newItem);

        // Check if there's existing playback first
        const existingPlayback =
          await synchronizedPlayback.checkExistingPlayback(workspaceId);
        if (!existingPlayback) {
          // Only start synchronized playback if no one else is playing
          try {
            await synchronizedPlayback.startPlayback(workspaceId, newItem, 0);
            setStatus("playing");
            setSyncedPosition(0);
          } catch (error) {
            console.warn("Failed to start synchronized playback:", error);
            setStatus("playing");
          }
        }
      } else {
        setQueue([...queue, newItem]);
      }

      setInputUrl("");
      setError("");

      // Validate URL by trying to fetch video information in background
      const result = await fetchYouTubeTitle(videoId);

      // Update with real title or show error if validation failed
      if (result.isValid) {
        const updatedItem = { ...newItem, title: result.title };

        if (!currentSong || currentSong.id === newItem.id) {
          setCurrentSong(updatedItem);
        } else {
          setQueue((prevQueue) =>
            prevQueue.map((song) =>
              song.id === newItem.id ? updatedItem : song,
            ),
          );
        }
      } else {
        // Remove the invalid item and show error
        if (!currentSong || currentSong.id === newItem.id) {
          setCurrentSong(null);
          setStatus("paused");
        } else {
          setQueue((prevQueue) =>
            prevQueue.filter((song) => song.id !== newItem.id),
          );
        }
        setError("Đường d��n không tồn tại hoặc bị lỗi.");
      }
    } catch (error) {
      // Validation failed
      setError("Đường dẫn không tồn tại hoặc bị lỗi.");
      console.warn("URL validation failed:", error);
    }
  };

  const playNext = async () => {
    if (queue.length > 0) {
      setStatus("loading");
      const nextSong = queue[0];
      setCurrentSong(nextSong);
      setQueue(queue.slice(1));

      // Start synchronized playback for new song
      if (workspaceId) {
        try {
          if (useWebSocketSync && wsConnected) {
            // Use WebSocket for ultra-fast sync
            wsSync.syncSongChange(nextSong);
            setStatus("playing");
            setSyncedPosition(0);
          } else {
            // Fallback to Firebase sync
            await synchronizedPlayback.changeSong(workspaceId, nextSong);
            setStatus("playing");
            setSyncedPosition(0);
          }
        } catch (error) {
          console.warn("Failed to sync song change:", error);
          setStatus("playing");
        }
      }
    } else {
      setCurrentSong(null);
      setStatus("paused");
    }
  };

  const removeFromQueue = (id: string) => {
    setQueue(queue.filter((song) => song.id !== id));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      addToQueue();
    }
  };

  const handlePlayerReady = useCallback(async () => {
    console.log("Player ready - checking playback state");

    // Check if there's existing synchronized playback
    if (workspaceId) {
      const existingPlayback =
        await synchronizedPlayback.checkExistingPlayback(workspaceId);

      if (existingPlayback) {
        // Join existing playback - auto-play at current position
        const currentPos =
          synchronizedPlayback.calculateCurrentPosition(existingPlayback);
        setSyncedPosition(currentPos);

        if (existingPlayback.type === "play") {
          setStatus("playing");
          console.log(
            "Joining existing playback - auto-playing at position:",
            currentPos,
          );
        } else {
          setStatus("paused");
        }
      } else if (currentSong) {
        // No existing playback but we have a song - start playing
        console.log("No existing playback - auto-starting new song");
        try {
          await synchronizedPlayback.startPlayback(workspaceId, currentSong, 0);
          setStatus("playing");
          setSyncedPosition(0);
        } catch (error) {
          console.warn("Failed to start playback:", error);
          setStatus("playing");
        }
      }
    } else {
      // Fallback - just play locally
      setStatus("playing");
    }
  }, [workspaceId, currentSong]);

  const handlePlayerEnd = useCallback(() => {
    setTimeout(() => {
      if (queue.length > 0) {
        // Play next song if available
        playNext();
      } else {
        // Clear current song when finished and no more songs
        setCurrentSong(null);
        setStatus("paused");
      }
    }, 2000);
  }, [queue]);

  const togglePlayPause = useCallback(async () => {
    if (!currentSong || !workspaceId) return;

    console.log("Toggle play/pause clicked, current status:", status);

    try {
      if (status === "playing") {
        // Pause for everyone in the room
        await synchronizedPlayback.pausePlayback(workspaceId, syncedPosition);
        setStatus("paused");
      } else {
        // Play for everyone in the room
        await synchronizedPlayback.startPlayback(
          workspaceId,
          currentSong,
          syncedPosition,
        );
        setStatus("playing");
      }
    } catch (error) {
      console.warn("Failed to sync playback:", error);
      // Fallback to local state change
      setStatus((prev) => (prev === "playing" ? "paused" : "playing"));
    }
  }, [status, currentSong, workspaceId, syncedPosition]);

  const copyWorkspaceUrl = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);

    // Show copied feedback for 3 seconds
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 3000);
  };

  const clearCurrentSong = () => {
    setCurrentSong(null);
    setStatus("paused");
  };

  const clearAllSongs = () => {
    setCurrentSong(null);
    setQueue([]);
    setStatus("paused");
    // Also clear from localStorage
    if (workspace && workspaceId) {
      const clearedWorkspace = {
        ...workspace,
        currentSong: null,
        queue: [],
        status: "paused" as const,
      };
      saveWorkspaceData(workspaceId, clearedWorkspace);
      try {
        realtimeService.updateWorkspace(workspaceId, clearedWorkspace);
      } catch (error) {
        console.warn("Failed to sync cleared state");
      }
    }
  };

  if (!workspace) {
    console.log("Workspace is null, showing loading state");
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        <div className="text-center">
          <div>Loading workspace...</div>
          <div className="text-sm text-gray-400 mt-2">
            Workspace ID: {workspaceId || "Unknown"}
          </div>
        </div>
      </div>
    );
  }

  // Render default state when no current song
  if (!currentSong) {
    return (
      <div className="w-full flex flex-col justify-center items-center px-4 py-8 bg-gray-900/40 min-h-screen">
        {/* Background */}
        <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-black" />

        {/* Main Container - Default State */}
        <div
          className="relative z-10 rounded-xl"
          style={{
            width: "375px",
            minHeight: "373px",
            background: "rgba(0, 0, 0, 0.80)",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/")}
              className="text-white hover:text-gray-300 transition-colors p-1"
              title="Quay về trang chọn workspace"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M19 11H7.83l4.88-4.88c.39-.39.39-1.03 0-1.42-.39-.39-1.02-.39-1.41 0l-6.59 6.59c-.39.39-.39 1.02 0 1.41l6.59 6.59c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L7.83 13H19c.55 0 1-.45 1-1s-.45-1-1-1z" />
              </svg>
            </button>
            <img
              src="https://cdn.builder.io/api/v1/image/assets%2Fd06e69fb86f44047b7162ed72bfce147%2Fcab92a1a55f944d6ab31d70365f33cf1?format=webp&width=800"
              alt="ZONE Logo"
              style={{ width: "100px", height: "29px" }}
            />
            <div
              style={{
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: "#06FF6A",
              }}
            />
          </div>

          {/* Divider */}
          <div
            style={{
              width: "343px",
              height: "1px",
              background: "rgba(167, 167, 167, 0.40)",
            }}
          />

          {/* Workspace ID Section */}
          <div style={{ width: "335px" }}>
            <div className="flex items-center gap-2 mb-2">
              <div
                className="font-montserrat text-xs font-bold uppercase tracking-wide"
                style={{
                  color: "#A7A7A7",
                  fontSize: "12px",
                  lineHeight: "18px",
                  letterSpacing: "0.3px",
                }}
              >
                {workspaceId}
              </div>
              <button
                onClick={copyWorkspaceUrl}
                className="hover:opacity-75 transition-opacity"
                title={isCopied ? "Copied!" : "Copy workspace URL"}
              >
                {isCopied ? (
                  <svg
                    width="13"
                    height="15"
                    viewBox="0 0 13 15"
                    fill="none"
                    style={{ width: "13px", height: "15px" }}
                  >
                    <path
                      d="M12.3334 3.66667L5.00008 11L0.666748 6.66667"
                      stroke="#06FF6A"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg
                    width="13"
                    height="16"
                    viewBox="0 0 13 16"
                    fill="none"
                    style={{ width: "13px", height: "15px" }}
                  >
                    <path
                      d="M8.84253 1.12439H1.96753C1.28003 1.12439 0.717529 1.68689 0.717529 2.37439V10.4994C0.717529 10.8432 0.998779 11.1244 1.34253 11.1244C1.68628 11.1244 1.96753 10.8432 1.96753 10.4994V2.99939C1.96753 2.65564 2.24878 2.37439 2.59253 2.37439H8.84253C9.18628 2.37439 9.46753 2.09314 9.46753 1.74939C9.46753 1.40564 9.18628 1.12439 8.84253 1.12439ZM11.3426 3.62439H4.46753C3.78003 3.62439 3.21753 4.18689 3.21753 4.87439V13.6243C3.21753 14.3119 3.78003 14.8744 4.46753 14.8744H11.3426C12.03 14.8744 12.5925 14.3119 12.5925 13.6243V4.87439C12.5925 4.18689 12.03 3.62439 11.3426 3.62439ZM10.7175 13.6243H5.09253C4.74878 13.6243 4.46753 13.3431 4.46753 12.9994V4.99939C4.46753 4.65564 4.74878 4.87439 5.09253 4.87439H10.7175C11.0613 4.87439 11.3426 5.15564 11.3426 5.49939V12.9994C11.3426 13.3431 11.0613 13.6243 10.7175 13.6243Z"
                      fill="white"
                    />
                  </svg>
                )}
              </button>
            </div>
            <div
              className="font-montserrat text-xs font-normal"
              style={{
                color: "#FFF",
                fontSize: "12px",
                lineHeight: "16px",
              }}
            >
              Share Room-ID hoặc copy đường dẫn để mời đồng nghiệp lên nh��c
              cùng nhé babe
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              width: "343px",
              height: "1px",
              background: "rgba(167, 167, 167, 0.40)",
            }}
          />

          {/* Currently Playing Section - Default State */}
          <div style={{ width: "341px" }}>
            <div
              className="font-montserrat text-xs font-bold uppercase tracking-wide mb-2"
              style={{
                color: "#FFF",
                fontSize: "12px",
                lineHeight: "18px",
                letterSpacing: "0.3px",
              }}
            >
              ĐANG PHÁT
            </div>
            <div className="flex items-center gap-3.5">
              <div
                className="font-montserrat text-xs font-normal"
                style={{
                  color: "#FFF",
                  fontSize: "12px",
                  lineHeight: "16px",
                  width: "257px",
                }}
              >
                L��n nhạc đi bạn yêu!
              </div>
              <div className="flex items-center gap-2.5 opacity-30">
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: "32px",
                    height: "32px",
                    padding: "10px",
                    borderRadius: "50%",
                    background: "#C60927",
                  }}
                >
                  <svg
                    width="12"
                    height="14"
                    viewBox="0 0 12 14"
                    fill="none"
                    style={{ width: "12px", height: "14px" }}
                  >
                    <path d="M10 7L2 2v10l8-5z" fill="white" />
                  </svg>
                </div>
                <svg
                  width="28"
                  height="18"
                  viewBox="0 0 28 18"
                  fill="none"
                  style={{ width: "28px", height: "18px" }}
                >
                  <g clipPath="url(#clip0_14098_28440)">
                    <path
                      d="M-0.000488281 16.0193L-0.000487054 1.97931C0.0013619 1.62343 0.0986145 1.27456 0.281137 0.969041C0.463659 0.663525 0.724772 0.412547 1.03727 0.242256C1.34977 0.0719643 1.70222 -0.0114082 2.05789 0.000825362C2.41357 0.0130588 2.75945 0.120451 3.05951 0.311811L12.9995 6.64181V1.97931C13.0013 1.62343 13.0986 1.27456 13.2811 0.969042C13.4636 0.663527 13.7247 0.412548 14.0372 0.242257C14.3497 0.0719655 14.7022 -0.0114071 15.0579 0.000826499C15.4135 0.01306 15.7594 0.120452 16.0595 0.311812L27.0832 7.33181C27.3641 7.51007 27.5954 7.75638 27.7556 8.04789C27.9159 8.3394 27.9999 8.66666 27.9999 8.99931C27.9999 9.33197 27.9159 9.65923 27.7556 9.95074C27.5954 10.2422 27.3641 10.4886 27.0832 10.6668L16.0595 17.6868C15.7595 17.8786 15.4135 17.9863 15.0577 17.9988C14.7019 18.0112 14.3492 17.9279 14.0366 17.7575C13.724 17.5872 13.4628 17.336 13.2804 17.0302C13.0979 16.7245 13.0009 16.3754 12.9995 16.0193V11.3568L3.05951 17.6868C2.75953 17.8786 2.41357 17.9863 2.05774 17.9988C1.70191 18.0112 1.34927 17.9279 1.03663 17.7575C0.723988 17.5872 0.462818 17.336 0.280388 17.0302C0.097957 16.7245 0.000955405 16.3754 -0.000488281 16.0193Z"
                      fill="#C60927"
                    />
                  </g>
                  <defs>
                    <clipPath id="clip0_14098_28440">
                      <rect width="28" height="18" fill="white" />
                    </clipPath>
                  </defs>
                </svg>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              width: "343px",
              height: "1px",
              background: "rgba(167, 167, 167, 0.40)",
            }}
          />

          {/* Input Section */}
          <div className="flex flex-col gap-2">
            <div
              className="flex items-start border rounded-xl"
              style={{
                width: "343px",
                height: "44px",
                padding: "13px",
                borderRadius: "12px",
                border: "1px solid rgba(228, 228, 228, 0.10)",
                background: "#000",
                gap: "12px",
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                style={{ width: "18px", height: "18px" }}
              >
                <g clipPath="url(#clip0_14098_28446)">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M1.25581 8.5814C1.25581 4.53559 4.53559 1.25581 8.5814 1.25581C12.6272 1.25581 15.907 4.53559 15.907 8.5814C15.907 12.6272 12.6272 15.907 8.5814 15.907C4.53559 15.907 1.25581 12.6272 1.25581 8.5814ZM8.5814 0C3.84202 0 0 3.84202 0 8.5814C0 13.3208 3.84202 17.1628 8.5814 17.1628C13.3208 17.1628 17.1628 13.3208 17.1628 8.5814C17.1628 3.84202 13.3208 0 8.5814 0ZM16.1417 15.2537C15.8965 15.0085 15.4989 15.0085 15.2537 15.2537C15.0085 15.4989 15.0085 15.8965 15.2537 16.1417L16.9281 17.8161C17.1733 18.0613 17.5709 18.0613 17.8161 17.8161C18.0613 17.5709 18.0613 17.1733 17.8161 16.9281L16.1417 15.2537Z"
                    fill="#A7A7A7"
                  />
                </g>
                <defs>
                  <clipPath id="clip0_14098_28446">
                    <rect width="18" height="18" fill="white" />
                  </clipPath>
                </defs>
              </svg>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Nhập link bài hát, chỉ hỗ trợ Youtube"
                className="flex-1 bg-transparent text-gray-400 text-xs font-montserrat outline-none border-none"
                style={{
                  color: "#A7A7A7",
                  fontSize: "12px",
                  lineHeight: "normal",
                }}
              />
            </div>

            <button
              onClick={addToQueue}
              className="flex justify-center items-center font-montserrat font-bold text-center transition-colors hover:opacity-90"
              style={{
                height: "45px",
                padding: "12px 93px",
                borderRadius: "8px",
                background: "#C60927",
                color: "#FFF",
                fontSize: "14px",
                lineHeight: "21px",
                whiteSpace: "nowrap",
              }}
            >
              Thêm vào playlist nhóm
            </button>

            {error && (
              <div className="text-red-500 text-xs font-montserrat">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Render active state when there are songs
  return (
    <div className="w-full flex flex-col justify-center items-center px-4 py-8 bg-gray-900/40 min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-black" />

      {/* Hidden Synchronized YouTube Player */}
      {currentSong && (
        <div className="hidden">
          <SynchronizedYouTubePlayer
            videoId={currentSong.videoId || ""}
            isPlaying={status === "playing"}
            startPosition={syncedPosition}
            onReady={handlePlayerReady}
            onEnd={handlePlayerEnd}
            onTimeUpdate={(currentTime) => {
              setSyncedPosition(currentTime);
              setLastSyncTime(Date.now());
            }}
          />
        </div>
      )}

      {/* Main Container - Active State */}
      <div className="relative z-10 w-[375px] bg-black/80 rounded-xl p-4">
        <div className="w-full flex flex-col space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2 w-full">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-white"
              >
                <path d="M19 11H7.83l4.88-4.88c.39-.39.39-1.03 0-1.42-.39-.39-1.02-.39-1.41 0l-6.59 6.59c-.39.39-.39 1.02 0 1.41l6.59 6.59c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41L7.83 13H19c.55 0 1-.45 1-1s-.45-1-1-1z" />
              </svg>
              <img
                src="https://cdn.builder.io/api/v1/image/assets%2Fd06e69fb86f44047b7162ed72bfce147%2Fcab92a1a55f944d6ab31d70365f33cf1?format=webp&width=800"
                alt="ZONE Logo"
                className="w-[100px] h-[29px]"
              />
              {currentSong && status === "playing" && (
                <div className="flex items-center gap-1 w-full justify-end">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-green-400 text-xs font-montserrat">
                    SYNC
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="h-px bg-gray-600/40 flex-shrink-0" />

          {/* Workspace ID Section */}
          <div className="relative flex-shrink-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="text-gray-400 font-bold text-xs uppercase tracking-wide font-montserrat">
                {workspaceId}
              </div>
              <button
                onClick={copyWorkspaceUrl}
                className="hover:opacity-75 transition-opacity"
                title={isCopied ? "Copied!" : "Copy workspace URL"}
              >
                {isCopied ? (
                  <svg width="13" height="15" viewBox="0 0 13 15" fill="none">
                    <path
                      d="M12.3334 3.66667L5.00008 11L0.666748 6.66667"
                      stroke="#06FF6A"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg width="13" height="15" viewBox="0 0 13 15" fill="none">
                    <path
                      d="M8.84253 0.62439H1.96753C1.28003 0.62439 0.717529 1.18689 0.717529 1.87439V9.99938C0.717529 10.3432 0.998779 10.6244 1.34253 10.6244C1.68628 10.6244 1.96753 10.3432 1.96753 9.99938V2.49939C1.96753 2.15564 2.24878 1.87439 2.59253 1.87439H8.84253C9.18628 1.87439 9.46753 1.59314 9.46753 1.24939C9.46753 0.90564 9.18628 0.62439 8.84253 0.62439ZM11.3426 3.12439H4.46753C3.78003 3.12439 3.21753 3.68689 3.21753 4.37439V13.1243C3.21753 13.8119 3.78003 14.3744 4.46753 14.3744H11.3426C12.03 14.3744 12.5925 13.8119 12.5925 13.1243V4.37439C12.5925 3.68689 12.03 3.12439 11.3426 3.12439ZM10.7175 13.1243H5.09253C4.74878 13.1243 4.46753 12.8431 4.46753 12.4994V4.99939C4.46753 4.65564 4.74878 4.37439 5.09253 4.37439H10.7175C11.0613 4.37439 11.3426 4.65564 11.3426 4.99939V12.4994C11.3426 12.8431 11.0613 13.1243 10.7175 13.1243Z"
                      fill="white"
                    />
                  </svg>
                )}
              </button>
            </div>
            <div className="text-white text-xs font-montserrat">
              Share Room-ID để cùng nghe nhạc đồng bộ theo thời gian thực. Tất
              cả mọi người sẽ nghe cùng lúc!
            </div>
          </div>

          <div className="h-px bg-gray-600/40" />

          {/* Currently Playing Section */}
          {currentSong && (
            <div className="bg-black/40 rounded-lg p-4 flex-shrink-0">
              <div className="text-white font-bold text-xs uppercase tracking-wide font-montserrat mb-2">
                ĐANG PHÁT
              </div>
              <div className="flex items-center justify-between gap-3.5">
                <div className="flex-1 text-white text-xs font-montserrat max-w-[257px]">
                  {currentSong
                    ? formatVideoTitle(currentSong.title, currentSong.videoId)
                    : "Lên nhạc đi bạn yêu!"}
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={togglePlayPause}
                    className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center transition-opacity p-2.5 hover:opacity-75"
                  >
                    {status === "playing" ? (
                      <svg
                        width="12"
                        height="14"
                        viewBox="0 0 12 14"
                        fill="none"
                      >
                        <path d="M4 2H2V12H4V2Z" fill="white" />
                        <path d="M10 2H8V12H10V2Z" fill="white" />
                      </svg>
                    ) : (
                      <svg
                        width="12"
                        height="14"
                        viewBox="0 0 12 14"
                        fill="none"
                        className="ml-0.5"
                      >
                        <path d="M10 7L2 2v10l8-5z" fill="white" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={queue.length > 0 ? playNext : undefined}
                    disabled={queue.length === 0}
                    className="transition-opacity hover:opacity-75"
                  >
                    <svg width="28" height="18" viewBox="0 0 28 18" fill="none">
                      <path
                        d="M-0.000366211 16.0193L-0.000364984 1.97931C0.00148398 1.62343 0.0987365 1.27456 0.281259 0.969041C0.463781 0.663525 0.724894 0.412547 1.03739 0.242256C1.34989 0.0719643 1.70234 -0.0114082 2.05801 0.000825362C2.41369 0.0130588 2.75957 0.120451 3.05963 0.311811L12.9997 6.64181V1.97931C13.0015 1.62343 13.0988 1.27456 13.2813 0.969042C13.4638 0.663527 13.7249 0.412548 14.0374 0.242257C14.3499 0.0719655 14.7024 -0.0114071 15.0581 0.000826499C15.4137 0.01306 15.7596 0.120452 16.0597 0.311812L27.0834 7.33181C27.3643 7.51007 27.5956 7.75638 27.7558 8.04789C27.9161 8.3394 28.0001 8.66666 28.0001 8.99931C28.0001 9.33197 27.9161 9.65923 27.7558 9.95074C27.5956 10.2422 27.3643 10.4886 27.0834 10.6668L16.0597 17.6868C15.7597 17.8786 15.4137 17.9863 15.0579 17.9988C14.7021 18.0112 14.3494 17.9279 14.0368 17.7575C13.7242 17.5872 13.463 17.336 13.2806 17.0302C13.0981 16.7245 13.0011 16.3754 12.9997 16.0193V11.3568L3.05963 17.6868C2.75965 17.8786 2.41369 17.9863 2.05786 17.9988C1.70203 18.0112 1.34939 17.9279 1.03675 17.7575C0.72411 17.5872 0.46294 17.336 0.28051 17.0302C0.0980791 16.7245 0.00107748 16.3754 -0.000366211 16.0193Z"
                        fill="#C60927"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="h-px bg-gray-600/40 flex-shrink-0" />

          {/* Input Section */}
          <div className="space-y-4 flex-shrink-0">
            <div className="flex items-center bg-black border border-gray-700/10 rounded-xl px-4 py-2.5">
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                className="mr-3"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M1.25581 8.5814C1.25581 4.53559 4.53559 1.25581 8.5814 1.25581C12.6272 1.25581 15.907 4.53559 15.907 8.5814C15.907 12.6272 12.6272 15.907 8.5814 15.907C4.53559 15.907 1.25581 12.6272 1.25581 8.5814ZM8.5814 0C3.84202 0 0 3.84202 0 8.5814C0 13.3208 3.84202 17.1628 8.5814 17.1628C13.3208 17.1628 17.1628 13.3208 17.1628 8.5814C17.1628 3.84202 13.3208 0 8.5814 0ZM16.1417 15.2537C15.8965 15.0085 15.4989 15.0085 15.2537 15.2537C15.0085 15.4989 15.0085 15.8965 15.2537 16.1417L16.9281 17.8161C17.1733 18.0613 17.5709 18.0613 17.8161 17.8161C18.0613 17.5709 18.0613 17.1733 17.8161 16.9281L16.1417 15.2537Z"
                  fill="#A7A7A7"
                />
              </svg>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Nhập link bài hát, chỉ hỗ trợ Youtube"
                className="flex-1 bg-transparent text-gray-400 text-xs font-montserrat outline-none"
              />
            </div>

            <button
              onClick={addToQueue}
              className="w-full bg-red-600 text-white font-bold text-sm py-3 rounded-lg hover:opacity-90 transition-opacity font-montserrat whitespace-nowrap"
            >
              Thêm vào playlist nhóm
            </button>

            {error && (
              <div className="text-red-500 text-xs font-montserrat">
                {error}
              </div>
            )}
          </div>

          {/* Queue Section - Only show if there are songs in queue */}
          {queue.length > 0 && (
            <>
              <div className="h-px bg-gray-600/40 flex-shrink-0" />
              <div className="flex-shrink-0">
                <div className="text-gray-400 font-bold text-xs uppercase tracking-wide font-montserrat mb-2">
                  SẮP TỚI LƯỢT ({queue.length}/10)
                </div>
                <div
                  className="space-y-6 custom-scrollbar pr-2"
                  style={{ maxHeight: "200px", overflowY: "auto" }}
                >
                  {queue.map((song) => (
                    <div
                      key={song.id}
                      className="flex items-start justify-between relative"
                    >
                      <div className="flex-1 text-white text-xs font-montserrat max-w-[288px]">
                        {formatVideoTitle(song.title, song.videoId)}
                      </div>
                      <button
                        onClick={() => removeFromQueue(song.id)}
                        className="absolute top-1 right-0 hover:opacity-75 transition-opacity"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <path
                            d="M9 3L3 9M3 3L9 9"
                            stroke="white"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WorkspacePage;
