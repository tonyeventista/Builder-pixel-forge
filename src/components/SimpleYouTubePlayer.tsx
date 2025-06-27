import { useEffect, useState, useRef, memo } from "react";

interface SimpleYouTubePlayerProps {
  videoId: string | null;
  isPlaying: boolean;
  onReady?: () => void;
  onEnd?: () => void;
}

// Memoize component to prevent unnecessary re-renders
export const SimpleYouTubePlayer = memo(
  ({ videoId, isPlaying, onReady, onEnd }: SimpleYouTubePlayerProps) => {
    const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isPlayerReady, setIsPlayerReady] = useState(false);

    useEffect(() => {
      if (videoId && videoId !== currentVideoId) {
        // Only recreate iframe when video actually changes
        setCurrentVideoId(videoId);
        setIsPlayerReady(false);

        // Reset ready state and simulate ready event faster
        setTimeout(() => {
          setIsPlayerReady(true);
          onReady?.();
        }, 500);
      }
    }, [videoId, currentVideoId, onReady]);

    // Control play/pause via postMessage to iframe
    useEffect(() => {
      if (isPlayerReady && iframeRef.current && currentVideoId) {
        try {
          if (isPlaying) {
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
        } catch (error) {
          // Silent error handling
        }
      }
    }, [isPlaying, isPlayerReady, currentVideoId]);

    if (!currentVideoId) return null;

    return (
      <div
        className="fixed"
        style={{
          position: "fixed",
          top: "-9999px",
          left: "-9999px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: -1,
        }}
      >
        <iframe
          ref={iframeRef}
          key={currentVideoId}
          width="1"
          height="1"
          src={`https://www.youtube.com/embed/${currentVideoId}?autoplay=1&controls=0&loop=0&mute=0&rel=0&showinfo=0&modestbranding=1&iv_load_policy=3&cc_load_policy=0&playsinline=1&enablejsapi=1&origin=${window.location.origin}`}
          title="YouTube audio player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  },
);
