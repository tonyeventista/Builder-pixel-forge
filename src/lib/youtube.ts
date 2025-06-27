export interface YouTubeVideoInfo {
  id: string;
  title: string;
  url: string;
}

/**
 * Extract YouTube video ID from various YouTube URL formats
 */
export const extractYouTubeVideoId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
};

/**
 * Validate if a URL is a valid YouTube URL
 */
export const isValidYouTubeUrl = (url: string): boolean => {
  const youtubePatterns = [
    /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/,
    /^https?:\/\/(www\.)?youtube\.com\/watch\?.*v=.+/,
    /^https?:\/\/youtu\.be\/.+/,
  ];

  return youtubePatterns.some((pattern) => pattern.test(url));
};

/**
 * Get YouTube video thumbnail URL
 */
export const getYouTubeThumbnail = (videoId: string): string => {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
};

/**
 * Extract basic video info from YouTube URL
 * In a real app, you'd want to use YouTube API for actual title
 */
export const getVideoInfo = async (
  url: string,
): Promise<YouTubeVideoInfo | null> => {
  const videoId = extractYouTubeVideoId(url);

  if (!videoId || !isValidYouTubeUrl(url)) {
    return null;
  }

  // For now, return basic info. In production, you'd fetch from YouTube API
  return {
    id: videoId,
    title: `Video ${videoId}`, // Placeholder - would be actual title from API
    url: url,
  };
};

/**
 * Format URL to ensure it's a proper YouTube watch URL
 */
export const normalizeYouTubeUrl = (url: string): string => {
  const videoId = extractYouTubeVideoId(url);
  if (videoId) {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
  return url;
};
