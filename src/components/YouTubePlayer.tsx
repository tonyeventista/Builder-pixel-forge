import { useEffect, useRef, useState } from "react";

interface YouTubePlayerProps {
  videoId: string | null;
  onReady?: () => void;
  onEnd?: () => void;
  onStateChange?: (state: number) => void;
  onPlayerReady?: (player: any) => void;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export const YouTubePlayer = ({
  videoId,
  onReady,
  onEnd,
  onStateChange,
  onPlayerReady,
}: YouTubePlayerProps) => {
  const playerRef = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState<any>(null);
  const [isAPIReady, setIsAPIReady] = useState(false);

  // Load YouTube API
  useEffect(() => {
    if (window.YT) {
      setIsAPIReady(true);
      return;
    }

    // Check if script already exists
    const existingScript = document.querySelector(
      'script[src*="youtube.com/iframe_api"]',
    );
    if (existingScript) {
      // Script exists, check API more frequently
      const checkAPI = () => {
        if (window.YT) {
          setIsAPIReady(true);
        } else {
          setTimeout(checkAPI, 50); // Check every 50ms instead of 100ms
        }
      };
      checkAPI();
      return;
    }

    // Create YouTube API script with preconnect for faster loading
    const preconnect = document.createElement("link");
    preconnect.rel = "preconnect";
    preconnect.href = "https://www.youtube.com";
    document.head.appendChild(preconnect);

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    window.onYouTubeIframeAPIReady = () => {
      setIsAPIReady(true);
    };

    return () => {
      window.onYouTubeIframeAPIReady = () => {};
    };
  }, []);

  // Initialize player when API is ready
  useEffect(() => {
    if (!isAPIReady || !playerRef.current || !videoId) return;

    let playerInstance: any = null;

    try {
      playerInstance = new window.YT.Player(playerRef.current, {
        height: "1",
        width: "1",
        videoId: videoId,
        playerVars: {
          autoplay: 0, // Disable autoplay to avoid browser blocking
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          showinfo: 0,
          start: 0,
          enablejsapi: 1,
          origin: window.location.origin,
          // Audio-only optimizations
          cc_load_policy: 0,
          color: "white",
          loop: 0,
          mute: 0,
          quality: "small", // Use lowest video quality for faster loading
          vq: "tiny", // Even smaller video quality
        },
        events: {
          onReady: (event: any) => {
            try {
              const player = event.target;
              setPlayer(player);

              // Create safe wrapper functions to handle cross-origin errors
              const safePlayerWrapper = {
                play: () => {
                  try {
                    player.playVideo();
                  } catch (error) {
                    // Silent error handling
                  }
                },
                pause: () => {
                  try {
                    player.pauseVideo();
                  } catch (error) {
                    // Silent error handling
                  }
                },
                stop: () => {
                  try {
                    player.stopVideo();
                  } catch (error) {
                    // Silent error handling
                  }
                },
                setVolume: (volume: number) => {
                  try {
                    player.setVolume(Math.max(0, Math.min(100, volume)));
                  } catch (error) {
                    // Silent error handling
                  }
                },
                getVolume: () => {
                  try {
                    return player.getVolume() || 100;
                  } catch (error) {
                    return 100;
                  }
                },
                getCurrentTime: () => {
                  try {
                    return player.getCurrentTime() || 0;
                  } catch (error) {
                    return 0;
                  }
                },
                getDuration: () => {
                  try {
                    return player.getDuration() || 0;
                  } catch (error) {
                    return 0;
                  }
                },
              };

              // Expose safe wrapper to parent component
              onPlayerReady?.(safePlayerWrapper);

              // Also expose globally as fallback
              (window as any).ytPlayer = safePlayerWrapper;

              // Start playing immediately after player is ready
              try {
                setTimeout(() => {
                  player.playVideo();
                }, 100);
              } catch (error) {
                // Silent error handling
              }

              // Safely call onReady
              try {
                onReady?.();
              } catch (error) {
                // Silent error handling
              }
            } catch (error) {
              // Silent error handling
            }
          },
          onStateChange: (event: any) => {
            try {
              onStateChange?.(event.data);
              if (event.data === window.YT.PlayerState.ENDED) {
                onEnd?.();
              }
            } catch (error) {
              // Silent error handling
            }
          },
          onError: (event: any) => {
            // Silent error handling
          },
        },
      });

      setPlayer(playerInstance);
    } catch (error) {
      // Silent error handling
    }

    return () => {
      try {
        if (playerInstance && typeof playerInstance.destroy === "function") {
          playerInstance.destroy();
        }
      } catch (error) {
        // Silent error handling
      }
    };
  }, [isAPIReady, videoId, onReady, onEnd, onStateChange]);

  return (
    <div
      className="hidden"
      style={{ position: "absolute", top: "-9999px", left: "-9999px" }}
    >
      <div ref={playerRef} />
    </div>
  );
};
