interface QueueItemProps {
  title: string;
  url: string;
  onRemove?: () => void;
}

export const QueueItem = ({ title, url, onRemove }: QueueItemProps) => {
  return (
    <div className="flex flex-col items-start gap-1 self-stretch py-1 group">
      <div className="flex justify-between items-start w-full">
        <div className="flex-1">
          <div className="self-stretch text-white text-xs leading-4 font-normal">
            {title}
          </div>
          <div className="self-stretch text-blue-400 text-xs leading-4 underline break-all font-normal">
            {url}
          </div>
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="ml-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all text-xs"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};
