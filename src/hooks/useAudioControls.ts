import { useState, useCallback } from "react";

export interface AudioControls {
  play: () => void;
  pause: () => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  getCurrentTime: () => number;
  getDuration: () => number;
}

export const useAudioControls = () => {
  const [isConnected, setIsConnected] = useState(false);

  const getPlayer = useCallback((): AudioControls | null => {
    if (typeof window !== "undefined" && (window as any).ytPlayer) {
      return (window as any).ytPlayer;
    }
    return null;
  }, []);

  const play = useCallback(() => {
    const player = getPlayer();
    if (player) {
      player.play();
      setIsConnected(true);
    }
  }, [getPlayer]);

  const pause = useCallback(() => {
    const player = getPlayer();
    if (player) {
      player.pause();
    }
  }, [getPlayer]);

  const stop = useCallback(() => {
    const player = getPlayer();
    if (player) {
      player.stop();
    }
  }, [getPlayer]);

  const setVolume = useCallback(
    (volume: number) => {
      const player = getPlayer();
      if (player) {
        player.setVolume(Math.max(0, Math.min(100, volume)));
      }
    },
    [getPlayer],
  );

  const getVolume = useCallback((): number => {
    const player = getPlayer();
    return player ? player.getVolume() : 100;
  }, [getPlayer]);

  const getCurrentTime = useCallback((): number => {
    const player = getPlayer();
    return player ? player.getCurrentTime() : 0;
  }, [getPlayer]);

  const getDuration = useCallback((): number => {
    const player = getPlayer();
    return player ? player.getDuration() : 0;
  }, [getPlayer]);

  return {
    play,
    pause,
    stop,
    setVolume,
    getVolume,
    getCurrentTime,
    getDuration,
    isConnected,
  };
};
