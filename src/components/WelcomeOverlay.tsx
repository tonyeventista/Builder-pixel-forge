import { useState } from "react";

interface WelcomeOverlayProps {
  onClose: () => void;
}

export const WelcomeOverlay = ({ onClose }: WelcomeOverlayProps) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-black/90 backdrop-blur-md rounded-xl p-6 max-w-sm w-full border border-white/10">
        <div className="flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="text-red-500 font-bold text-xl">🎵</div>
              <div className="text-red-500 font-bold text-xl tracking-wider font-montserrat">
                ZONE
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Instructions */}
          <div className="flex flex-col gap-3 text-white font-montserrat">
            <h3 className="font-bold text-sm">Hướng dẫn sử dụng:</h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-start gap-2">
                <span className="text-red-500 font-bold">1.</span>
                <span>Copy link YouTube bài hát bạn muốn nghe</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-red-500 font-bold">2.</span>
                <span>Paste vào ô tìm kiếm và bấm "Lên cho anh bài này"</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-red-500 font-bold">3.</span>
                <span>
                  Bài hát sẽ được thêm vào hàng đợi và phát theo thứ tự
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-red-500 font-bold">4.</span>
                <span>Mọi người trong team đều có thể thêm bài hát</span>
              </div>
            </div>
          </div>

          {/* Example */}
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-gray-300 text-xs font-montserrat">
              <div className="font-bold mb-1">Ví dụ link YouTube:</div>
              <div className="text-blue-400 break-all">
                https://www.youtube.com/watch?v=dQw4w9WgXcQ
              </div>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full bg-red-600 hover:bg-red-700 transition-colors rounded-lg py-3 px-4 text-white font-bold text-sm font-montserrat"
          >
            Bắt đầu sử dụng
          </button>
        </div>
      </div>
    </div>
  );
};
