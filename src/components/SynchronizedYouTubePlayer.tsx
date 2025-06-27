import { useEffect, useState, useRef, memo } from "react";

interface SynchronizedYouTubePlayerProps {
  videoId: string | null;
  isPlaying: boolean;
  startPosition?: number; // Position to start/seek to
  isLocallyPaused?: boolean; // New: indicates if user paused locally
  serverPlaying?: boolean; // New: indicates if server is playing
  onReady?: () => void;
  onEnd?: () => void;
  onTimeUpdate?: (currentTime: number) => void;
}

// Memoize component to prevent unnecessary re-renders
export const SynchronizedYouTubePlayer = memo(
  ({
    videoId,
    isPlaying,
    startPosition = 0,
    isLocallyPaused = false,
    serverPlaying = false,
    onReady,
    onEnd,
    onTimeUpdate,
  }: SynchronizedYouTubePlayerProps) => {
    const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isPlayerReady, setIsPlayerReady] = useState(false);
    const timeUpdateInterval = useRef<NodeJS.Timeout | null>(null);

    // Handle video change
    useEffect(() => {
      if (videoId && videoId !== currentVideoId) {
        setCurrentVideoId(videoId);
        setIsPlayerReady(false);

        // Reset and initialize player
        setTimeout(() => {
          setIsPlayerReady(true);
          onReady?.();
        }, 1000);
      }
    }, [videoId, currentVideoId, onReady]);

    // Handle play/pause and seeking with local pause consideration
    useEffect(() => {
      if (isPlayerReady && iframeRef.current && currentVideoId) {
        try {
          // Determine actual playback state: pause if locally paused OR if not playing
          const shouldPlay = isPlaying && !isLocallyPaused;

          console.log("Controlling player:", {
            isPlaying,
            isLocallyPaused,
            serverPlaying,
            shouldPlay,
            startPosition,
          });

          // Seek to start position if provided and greater than 3 seconds
          if (startPosition > 3) {
            console.log("Seeking to position:", startPosition);
            iframeRef.current.contentWindow?.postMessage(
              `{"event":"command","func":"seekTo","args":[${startPosition}, true]}`,
              "*",
            );
            // Small delay before play/pause command
            setTimeout(() => {
              if (shouldPlay) {
                iframeRef.current?.contentWindow?.postMessage(
                  '{"event":"command","func":"playVideo","args":""}',
                  "*",
                );
              } else {
                iframeRef.current?.contentWindow?.postMessage(
                  '{"event":"command","func":"pauseVideo","args":""}',
                  "*",
                );
              }
            }, 500);
          } else {
            // Control playback immediately if no seeking needed
            if (shouldPlay) {
              iframeRef.current.contentWindow?.postMessage(
                '{"event":"command","func":"playVideo","args":""}',
                "*",
              );
            } else {
              iframeRef.current.contentWindow?.postMessage(
                '{"event":"command","func":"pauseVideo","args":""}',
                "*",
              );
            }
          }
        } catch (error) {
          console.warn("YouTube player control error:", error);
        }
      }
    }, [
      isPlayerReady,
      isPlaying,
      isLocallyPaused,
      serverPlaying,
      startPosition,
      currentVideoId,
    ]);

    // Start time tracking when playing (but not when locally paused)
    useEffect(() => {
      const shouldTrackTime =
        isPlaying && !isLocallyPaused && isPlayerReady && onTimeUpdate;

      if (shouldTrackTime) {
        timeUpdateInterval.current = setInterval(() => {
          if (iframeRef.current) {
            try {
              // Request current time from player
              iframeRef.current.contentWindow?.postMessage(
                '{"event":"command","func":"getCurrentTime","args":""}',
                "*",
              );
            } catch (error) {
              console.warn("YouTube time update error:", error);
            }
          }
        }, 1000);
      } else {
        if (timeUpdateInterval.current) {
          clearInterval(timeUpdateInterval.current);
          timeUpdateInterval.current = null;
        }
      }

      return () => {
        if (timeUpdateInterval.current) {
          clearInterval(timeUpdateInterval.current);
        }
      };
    }, [isPlaying, isLocallyPaused, isPlayerReady, onTimeUpdate]);

    // Listen for messages from YouTube player
    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== "https://www.youtube.com") return;

        try {
          const data = JSON.parse(event.data);

          // Handle player state changes
          if (data.event === "video-progress" && onTimeUpdate) {
            onTimeUpdate(data.info?.currentTime || 0);
          }

          // Handle video end
          if (data.event === "video-ended" || data.info?.playerState === 0) {
            onEnd?.();
          }
        } catch (error) {
          // Ignore parsing errors
        }
      };

      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }, [onTimeUpdate, onEnd]);

    if (!currentVideoId) {
      return null;
    }

    const youtubeUrl = `https://www.youtube.com/embed/${currentVideoId}?enablejsapi=1&autoplay=1&controls=0&modestbranding=1&rel=0&showinfo=0&fs=0&cc_load_policy=0&iv_load_policy=3&autohide=0`;

    return (
      <div className="relative w-full h-0 pb-[56.25%] overflow-hidden opacity-0 pointer-events-none">
        <iframe
          ref={iframeRef}
          src={youtubeUrl}
          className="absolute top-0 left-0 w-full h-full border-0"
          allow="autoplay; encrypted-media"
          title="YouTube Player"
        />
      </div>
    );
  },
);

SynchronizedYouTubePlayer.displayName = "SynchronizedYouTubePlayer";
