interface StatusIndicatorProps {
  status: "playing" | "paused" | "loading" | "error";
  className?: string;
}

export const StatusIndicator = ({
  status,
  className = "",
}: StatusIndicatorProps) => {
  const getStatusColor = () => {
    switch (status) {
      case "playing":
        return "bg-green-500";
      case "paused":
        return "bg-yellow-500";
      case "loading":
        return "bg-blue-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "playing":
        return "Đang phát";
      case "paused":
        return "Tạm dừng";
      case "loading":
        return "Đang tải";
      case "error":
        return "Lỗi";
      default:
        return "Không rõ";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "loading":
        return "🔊";
      default:
        return null;
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {status === "loading" ? (
        <div className="flex items-center gap-1">
          <span className="text-xs animate-pulse">{getStatusIcon()}</span>
          <div
            className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse`}
          />
        </div>
      ) : (
        <div
          className={`w-2 h-2 rounded-full ${getStatusColor()} ${
            status === "playing" ? "animate-pulse" : ""
          }`}
        />
      )}
      <span className="text-xs text-gray-300 font-montserrat">
        {getStatusText()}
      </span>
    </div>
  );
};
