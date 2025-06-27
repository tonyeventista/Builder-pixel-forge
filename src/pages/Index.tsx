import { useState, useEffect, useCallback } from "react";
import { QueueItem } from "@/components/QueueItem";
import { StatusIndicator } from "@/components/StatusIndicator";
import { WelcomeOverlay } from "@/components/WelcomeOverlay";
import { SimpleYouTubePlayer } from "@/components/SimpleYouTubePlayer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  isValidYouTubeUrl,
  normalizeYouTubeUrl,
  extractYouTubeVideoId,
} from "@/lib/youtube";

interface Song {
  id: string;
  title: string;
  url: string;
  videoId?: string;
}

const Index = () => {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);

  const [queue, setQueue] = useState<Song[]>([]);

  const [inputUrl, setInputUrl] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<
    "playing" | "paused" | "loading" | "error"
  >("paused");
  const [showWelcome, setShowWelcome] = useState(false);
  const [isLoadingNewSong, setIsLoadingNewSong] = useState(false);
  useEffect(() => {
    // Show welcome overlay for first-time users
    const hasVisited = localStorage.getItem("youtube-queue-visited");
    if (!hasVisited) {
      // Very quick delay to let the interface render first
      setTimeout(() => {
        setShowWelcome(true);
        localStorage.setItem("youtube-queue-visited", "true");
      }, 50);
    }
  }, []);

  const addToQueue = () => {
    const trimmedUrl = inputUrl.trim();

    if (!trimmedUrl) {
      setError("Vui lòng nhập link YouTube");
      return;
    }

    if (!isValidYouTubeUrl(trimmedUrl)) {
      setError("Link không hợp lệ, chỉ hỗ trợ YouTube");
      return;
    }

    const normalizedUrl = normalizeYouTubeUrl(trimmedUrl);
    const videoId = extractYouTubeVideoId(normalizedUrl);

    // Check if already in queue or currently playing
    const isAlreadyInQueue = queue.some((song) => song.url === normalizedUrl);
    const isCurrentSong = currentSong?.url === normalizedUrl;

    if (isAlreadyInQueue || isCurrentSong) {
      setError("Bài hát đã có trong danh sách");
      return;
    }

    const newItem: Song = {
      id: Date.now().toString(),
      title: `Video ${videoId || "Unknown"}`,
      url: normalizedUrl,
      videoId: videoId || undefined,
    };

    // Add directly - no validation delays
    if (!currentSong) {
      setStatus("loading");
      setCurrentSong(newItem);
    } else {
      // Always add to queue if there's already a current song
      setQueue([...queue, newItem]);
    }

    setInputUrl("");
    setError("");
  };
  const removeFromQueue = (id: string) => {
    setQueue(queue.filter((song) => song.id !== id));
  };

  const playNext = () => {
    if (queue.length > 0) {
      setStatus("loading");
      const nextSong = queue[0];
      setCurrentSong(nextSong);
      setQueue(queue.slice(1));
    } else {
      // No more songs in queue
      setCurrentSong(null);
      setStatus("paused");
    }
  };

  // Simple player event handlers with useCallback to prevent re-renders
  const handlePlayerReady = useCallback(() => {
    setStatus("playing");
  }, []);

  const handlePlayerEnd = useCallback(() => {
    // Auto play next song after 2 seconds
    setTimeout(() => {
      playNext();
    }, 2000);
  }, []);

  // Stable pause/play toggle
  const togglePlayPause = useCallback(() => {
    setStatus((prev) => (prev === "playing" ? "paused" : "playing"));
  }, []);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      addToQueue();
    }
  };

  return (
    <>
      {showWelcome && <WelcomeOverlay onClose={() => setShowWelcome(false)} />}
      <div className="min-h-screen w-full flex flex-col justify-center items-center px-4 py-8 lg:py-16">
        {/* Background Gradient - Instant Load */}
        <div className="fixed inset-0 w-full h-full bg-gradient-to-br from-gray-900 via-gray-800 to-black" />

        {/* Main container with overlay */}
        <div className="relative z-10 flex p-4 justify-center items-center gap-4 rounded-3xl bg-black/40 backdrop-blur-sm w-full max-w-sm lg:max-w-md">
          {/* Main card */}
          <div className="flex w-full p-4 lg:p-6 flex-col justify-center items-center gap-4 rounded-xl bg-black/80 backdrop-blur-sm">
            {/* Logo/Brand section */}
            <div className="flex justify-between items-center self-stretch">
              <div className="flex items-center gap-2">
                <div className="text-red-500 font-bold text-lg">🎵</div>
                <div className="text-red-500 font-bold text-lg tracking-wider">
                  ZONE
                </div>
              </div>
            </div>

            {/* Currently Playing Section */}
            <div className="flex flex-col items-start gap-2 self-stretch">
              <div className="flex justify-between items-center w-full">
                <div className="text-white font-bold text-xs leading-5 uppercase tracking-wide font-montserrat">
                  ĐANG PHÁT
                </div>
                <StatusIndicator status={status} />
              </div>
              <div className="flex flex-col items-start gap-1 self-stretch">
                <div className="self-stretch text-white text-xs leading-4 font-normal font-montserrat">
                  {currentSong ? currentSong.title : "Chưa có bài hát nào"}
                </div>
                <div className="self-stretch text-blue-400 text-xs leading-4 underline break-all font-normal font-montserrat">
                  {currentSong
                    ? currentSong.url
                    : "Thêm bài hát đầu tiên để bắt đầu"}
                </div>
              </div>
              {currentSong && (
                <div className="flex gap-3 mt-2">
                  <button
                    onClick={togglePlayPause}
                    className="text-xs text-gray-300 hover:text-white transition-colors font-montserrat flex items-center gap-1"
                  >
                    {status === "playing" ? "⏸" : "▶️"}
                    {status === "playing" ? "Tạm dừng" : "Phát"}
                  </button>
                  {queue.length > 0 && (
                    <button
                      onClick={playNext}
                      className="text-xs text-gray-300 hover:text-white transition-colors font-montserrat flex items-center gap-1"
                    >
                      ⏭ Tiếp theo
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Input Section */}
            <div className="flex flex-col gap-2 self-stretch">
              <div className="flex justify-center items-start gap-3 self-stretch">
                <div className="flex h-11 px-3 py-1 items-center gap-4 flex-1 rounded-[20px] border border-white/10 bg-black">
                  <div className="flex items-center gap-2 flex-1">
                    {/* Search Icon */}
                    <svg
                      className="w-[19px] h-8 flex-shrink-0"
                      viewBox="0 0 19 33"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M1.75581 16.0814C1.75581 12.0356 5.03559 8.75581 9.0814 8.75581C13.1272 8.75581 16.407 12.0356 16.407 16.0814C16.407 20.1272 13.1272 23.407 9.0814 23.407C5.03559 23.407 1.75581 20.1272 1.75581 16.0814ZM9.0814 7.5C4.34202 7.5 0.5 11.342 0.5 16.0814C0.5 20.8208 4.34202 24.6628 9.0814 24.6628C13.8208 24.6628 17.6628 20.8208 17.6628 16.0814C17.6628 11.342 13.8208 7.5 9.0814 7.5ZM16.6417 22.7537C16.3965 22.5085 15.9989 22.5085 15.7537 22.7537C15.5085 22.9989 15.5085 23.3965 15.7537 23.6417L17.4281 25.3161C17.6733 25.5613 18.0709 25.5613 18.3161 25.3161C18.5613 25.0709 18.5613 24.6733 18.3161 24.4281L16.6417 22.7537Z"
                        fill="#A7A7A7"
                      />
                    </svg>

                    {/* Input Field */}
                    <input
                      type="text"
                      value={inputUrl}
                      onChange={(e) => setInputUrl(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Nhập link bài hát, chỉ hỗ trợ Youtube"
                      className="flex-1 bg-transparent text-gray-400 text-xs leading-4 placeholder:text-gray-400 border-none outline-none font-medium font-montserrat"
                    />
                  </div>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="text-red-400 text-xs font-montserrat">
                  {error}
                </div>
              )}
            </div>

            {/* Add Button */}
            <button
              onClick={addToQueue}
              className="flex h-11 px-4 py-[18px] justify-center items-center gap-4 self-stretch rounded-lg bg-red-600 hover:bg-red-700 transition-colors active:bg-red-800"
            >
              <div className="text-white text-center text-sm font-bold leading-5 font-montserrat">
                Lên cho anh bài này
              </div>
            </button>

            {/* Queue Section */}
            <div className="flex flex-col items-start gap-2 self-stretch">
              <div className="flex justify-between items-center self-stretch">
                <div className="text-white font-bold text-xs leading-5 uppercase tracking-wide font-montserrat">
                  SẮP TỚI LƯỢT
                </div>
                <div className="text-gray-400 text-xs font-montserrat">
                  {queue.length} bài
                </div>
              </div>

              {/* Queue Items */}
              {queue.length > 0 ? (
                <div className="flex flex-col items-start gap-1 self-stretch max-h-48 overflow-y-auto scrollbar-thin scrollbar-track-gray-800 scrollbar-thumb-gray-600">
                  {queue.map((item) => (
                    <QueueItem
                      key={item.id}
                      title={item.title}
                      url={item.url}
                      onRemove={() => removeFromQueue(item.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-gray-400 text-xs font-montserrat py-4 text-center self-stretch">
                  Danh sách chờ trống
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Simple YouTube Player */}
        {currentSong && currentSong.videoId && (
          <SimpleYouTubePlayer
            videoId={currentSong.videoId}
            isPlaying={status === "playing"}
            onReady={handlePlayerReady}
            onEnd={handlePlayerEnd}
          />
        )}
      </div>
    </>
  );
};

export default Index;
