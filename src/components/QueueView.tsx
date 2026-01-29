import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { invoke } from "@tauri-apps/api/tauri";
import { useQueueStore } from "../stores/queueStore";
import { usePlayerStore } from "../stores/playerStore";
import { usePlaylistStore } from "../stores/playlistStore";
import { useSongStore } from "../stores/songStore";
import { useToastStore } from "../stores/toastStore";
import { AlbumArtImage } from "./AlbumArtImage";
import { SongContextMenu } from "./SongContextMenu";
import { PlaylistSelectModal } from "./PlaylistSelectModal";
import { MetadataModal } from "./MetadataModal";
import { TagModal } from "./TagModal";
import { Song } from "../types";
import { Disc3, Film, ImageIcon, Maximize2, SlidersHorizontal, Pause, Play } from "lucide-react";
import { toFileSrc } from "../lib/tauri";

type VideoSync = {
  songId: number;
  videoPath: string;
  delayMs: number;
};

const normalizeFsPath = (value: string) => {
  let result = value.trim();
  if (result.toLowerCase().startsWith("file://")) {
    result = decodeURIComponent(result.replace(/^file:\/*/i, ""));
  }
  if (result.startsWith("\\\\?\\")) {
    result = result.slice(4);
    if (result.startsWith("UNC\\")) {
      result = `\\\\${result.slice(4)}`;
    }
  }
  return result;
};

export const QueueView = () => {
  const { queue, currentIndex, playSongAtIndex, removeFromQueue, reorderQueue } = useQueueStore();
  const {
    currentTime,
    duration,
    isPlaying,
    togglePlayPause,
    seek,
    setCurrentTime,
    currentSong: playerCurrentSong,
  } = usePlayerStore();
  const { playlists } = usePlaylistStore();
  const { updateSong, refreshCurrentList } = useSongStore();
  const { showToast } = useToastStore();

  const currentSong = currentIndex !== null ? queue[currentIndex] : playerCurrentSong;
  const [mediaMode, setMediaMode] = useState<"cover" | "video">("cover");
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [syncOffsetMs, setSyncOffsetMs] = useState(0);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isVideoLoading, setIsVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncSliderRef = useRef<HTMLInputElement | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const queueListRef = useRef<HTMLDivElement | null>(null);
  const dragRowHeightRef = useRef(0);
  const [syncTooltip, setSyncTooltip] = useState<{ visible: boolean; left: number }>({
    visible: false,
    left: 0,
  });
  const syncPercent = Math.round(((syncOffsetMs + 10000) / 20000) * 100);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const mediaContainerRef = useRef<HTMLDivElement | null>(null);
  const fullscreenSliderRef = useRef<HTMLInputElement | null>(null);
  const lastPlayerTimeRef = useRef<number>(0);
  const isSeekingRef = useRef(false);
  const [showClickIcon, setShowClickIcon] = useState<null | "play" | "pause">(null);
  const clickIconTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fullscreenTooltip, setFullscreenTooltip] = useState<{
    visible: boolean;
    left: number;
    time: number;
  }>({
    visible: false,
    left: 0,
    time: 0,
  });

  const [contextMenu, setContextMenu] = useState<{
    song: Song;
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [selectedSongForMetadata, setSelectedSongForMetadata] = useState<Song | null>(null);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [selectedSongForTags, setSelectedSongForTags] = useState<Song | null>(null);
  const [isPlaylistSelectModalOpen, setIsPlaylistSelectModalOpen] = useState(false);
  const [selectedSongForPlaylist, setSelectedSongForPlaylist] = useState<Song | null>(null);

  const videoSrc = useMemo(() => (videoPath ? toFileSrc(normalizeFsPath(videoPath)) : null), [videoPath]);

  const handleSongDoubleClick = async (index: number) => {
    await playSongAtIndex(index);
  };

  useEffect(() => {
    if (dragIndex === null) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (!queueListRef.current || dragRowHeightRef.current === 0) return;
      const rect = queueListRef.current.getBoundingClientRect();
      const y = event.clientY - rect.top + queueListRef.current.scrollTop;
      const nextIndex = Math.max(
        0,
        Math.min(queue.length - 1, Math.floor(y / dragRowHeightRef.current))
      );
      setDragOverIndex(nextIndex);
    };

    const handlePointerUp = () => {
      if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
        reorderQueue(dragIndex, dragOverIndex);
      }
      setDragIndex(null);
      setDragOverIndex(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragIndex, dragOverIndex, queue.length, reorderQueue]);

  const handleVideoToggle = async () => {
    if (!playerCurrentSong && currentIndex !== null) {
      await playSongAtIndex(currentIndex);
      return;
    }
    await togglePlayPause();
  };

  const triggerClickIcon = () => {
    if (clickIconTimerRef.current) {
      clearTimeout(clickIconTimerRef.current);
    }
    const nextIcon: "play" | "pause" = isPlaying ? "pause" : "play";
    setShowClickIcon(nextIcon);
    clickIconTimerRef.current = setTimeout(() => {
      setShowClickIcon(null);
    }, 520);
  };


  const handleFullscreenSeek = (next: number) => {
    if (playerCurrentSong) {
      seek(next).catch(() => {});
      return;
    }
    setCurrentTime(next);
    invoke("seek_audio", { time: next }).catch(() => {});
  };

  const handleSongContextMenu = (e: ReactMouseEvent, song: Song, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ song, index, x: e.clientX, y: e.clientY });
  };

  const handleRemoveFromQueue = (_song: Song) => {
    if (!contextMenu) return;
    removeFromQueue(contextMenu.index);
  };

  const handleEditMetadata = (song: Song) => {
    setSelectedSongForMetadata(song);
    setIsMetadataModalOpen(true);
  };

  const handleEditTags = (song: Song) => {
    setSelectedSongForTags(song);
    setIsTagModalOpen(true);
  };

  const handleMetadataSave = async (payload: {
    title: string;
    artist: string;
    album: string;
    year: number | null;
    genre: string;
    albumArtist: string;
    trackNumber: number | null;
    discNumber: number | null;
    comment: string;
    albumArtPath: string;
    composer: string;
    lyricist: string;
    bpm: number | null;
    key: string;
    copyright: string;
    encoder: string;
    isrc: string;
    publisher: string;
    subtitle: string;
    grouping: string;
  }) => {
    if (!selectedSongForMetadata) return;
    try {
      const updatedSong = await invoke<Song>('update_song_metadata', {
        payload: {
          songId: selectedSongForMetadata.id,
          ...payload,
        },
      });
      updateSong(updatedSong);
      showToast('메타데이터가 저장되었습니다.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showToast(errorMessage || '메타데이터 저장에 실패했습니다.');
      await refreshCurrentList();
      throw error;
    }
  };

  const handleTagSave = async (tags: string[]) => {
    if (!selectedSongForTags) return;
    try {
      const updatedSong = await invoke<Song>('update_song_tags', {
        payload: {
          songId: selectedSongForTags.id,
          tags,
        },
      });
      updateSong(updatedSong);
      showToast('태그가 저장되었습니다.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showToast(errorMessage || '태그 저장에 실패했습니다.');
      await refreshCurrentList();
      throw error;
    }
  };

  const handleAddToPlaylist = (song: Song) => {
    setSelectedSongForPlaylist(song);
    setIsPlaylistSelectModalOpen(true);
  };

  const handlePlaylistSelect = async (playlistId: number) => {
    if (!selectedSongForPlaylist) return;
    try {
      await invoke('add_song_to_playlist', {
        playlistId,
        songId: selectedSongForPlaylist.id,
      });
      const playlist = playlists.find((p) => p.id === playlistId);
      showToast(`${playlist?.name || '플레이리스트'}에 추가했습니다.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      showToast(errorMessage || '플레이리스트에 추가하는 데 실패했습니다.');
      throw error;
    }
  };

  const loadVideoSync = async (songId: number) => {
    setIsVideoReady(false);
    setIsVideoLoading(false);
    setVideoError(null);

    try {
      const data = await invoke<VideoSync | null>("get_video_sync", { songId });
      if (!data?.videoPath) {
        setVideoPath(null);
        setSyncOffsetMs(0);
        setMediaMode("cover");
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        return;
      }

      setVideoPath(data.videoPath);
      setSyncOffsetMs(data.delayMs ?? 0);
      setVideoError(null);
    } catch (error) {
      console.error("Failed to load video sync:", error);
      setVideoPath(null);
      setSyncOffsetMs(0);
      setMediaMode("cover");
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  useEffect(() => {
    if (!currentSong) {
      setVideoPath(null);
      setSyncOffsetMs(0);
      setMediaMode("cover");
      setVideoError(null);
      setIsVideoReady(false);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      return;
    }
    loadVideoSync(currentSong.id);
  }, [currentSong?.id]);

  useEffect(() => {
    const handleVideoSyncUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ songId: number }>).detail;
      if (!detail || !currentSong) return;
      if (detail.songId !== currentSong.id) return;
      loadVideoSync(currentSong.id);
    };
    window.addEventListener("video-sync-updated", handleVideoSyncUpdate as EventListener);
    return () => {
      window.removeEventListener("video-sync-updated", handleVideoSyncUpdate as EventListener);
    };
  }, [currentSong?.id]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (!videoPath) return;
    videoRef.current.muted = true;
  }, [videoPath]);


  useEffect(() => {
    if (mediaMode !== "video") return;
    if (!videoRef.current || !videoSrc) return;
    videoRef.current.load();
  }, [mediaMode, videoSrc]);

  useEffect(() => {
    if (!videoRef.current || !isVideoReady || !videoPath) return;
    if (mediaMode !== "video") return;

    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, mediaMode, isVideoReady, videoPath]);

  useEffect(() => {
    if (!videoRef.current || !isVideoReady || !videoPath) return;
    if (mediaMode !== "video") return;

    const prev = lastPlayerTimeRef.current;
    const delta = Math.abs(currentTime - prev);
    lastPlayerTimeRef.current = currentTime;

    // Seek jump only: sync once to avoid flicker from continuous seeking.
    if (delta > 0.8) {
      isSeekingRef.current = true;
      const video = videoRef.current;
      const targetTime = Math.max(0, currentTime + syncOffsetMs / 1000);
      if (Number.isFinite(video.duration)) {
        const maxTime = Math.max(0, video.duration - 0.05);
        video.currentTime = Math.min(targetTime, maxTime);
      } else {
        video.currentTime = targetTime;
      }
      setTimeout(() => {
        isSeekingRef.current = false;
      }, 300);
    }
  }, [currentTime, syncOffsetMs, mediaMode, isVideoReady, videoPath]);

  useEffect(() => {
    if (syncTimerRef.current) {
      clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    if (!videoRef.current || !isVideoReady || !videoPath) return;
    if (mediaMode !== "video") return;
    if (!isPlaying) return;

    syncTimerRef.current = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      if (isSeekingRef.current) return;
      const targetTime = Math.max(0, currentTime + syncOffsetMs / 1000);
      const delta = Math.abs(video.currentTime - targetTime);
      if (delta < 1.0) return;

      if (Number.isFinite(video.duration)) {
        const maxTime = Math.max(0, video.duration - 0.05);
        const clamped = Math.min(targetTime, maxTime);
        if (Math.abs(video.currentTime - clamped) > 0.35) {
          video.currentTime = clamped;
        }
      } else {
        video.currentTime = targetTime;
      }
    }, 1200);

    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [currentTime, syncOffsetMs, mediaMode, isVideoReady, videoPath, isPlaying]);

  useEffect(() => {
    if (!currentSong || !videoPath) return;
    if (saveDelayTimerRef.current) {
      clearTimeout(saveDelayTimerRef.current);
    }
    saveDelayTimerRef.current = setTimeout(() => {
      invoke("update_video_sync_delay", {
        songId: currentSong.id,
        delayMs: syncOffsetMs,
      }).catch((error) => {
        console.error("Failed to save video sync delay:", error);
      });
    }, 300);

    return () => {
      if (saveDelayTimerRef.current) {
        clearTimeout(saveDelayTimerRef.current);
      }
    };
  }, [syncOffsetMs, currentSong?.id, videoPath]);

  useEffect(() => {
    if (mediaMode !== "video") {
      setIsSyncOpen(false);
    }
  }, [mediaMode]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handleToggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (!mediaContainerRef.current) return;
      await mediaContainerRef.current.requestFullscreen();
    } catch (error) {
      console.error("Failed to toggle fullscreen:", error);
    }
  };


  return (
    <div className="h-full w-full flex overflow-hidden bg-bg-primary relative">
      {/* 좌측: 앨범 커버/동영상 */}
      <div className="flex-1 flex flex-col items-center justify-center bg-bg-primary h-full gap-4 relative">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMediaMode("cover")}
            className={`h-8 px-3 rounded-md border text-xs transition-colors flex items-center gap-2 ${
              mediaMode === "cover"
                ? "bg-accent text-white border-transparent"
                : "bg-bg-sidebar text-text-muted border-border hover:text-text-primary"
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            앨범 커버
          </button>
          <button
            type="button"
            onClick={() => {
              if (!videoPath) return;
              setMediaMode("video");
              setIsVideoLoading(true);
            }}
            disabled={!videoPath}
            className={`h-8 px-3 rounded-md border text-xs transition-colors flex items-center gap-2 ${
              mediaMode === "video"
                ? "bg-accent text-white border-transparent"
                : "bg-bg-sidebar text-text-muted border-border"
            } ${videoPath ? "hover:text-text-primary cursor-pointer" : "opacity-50 cursor-default"}`}
          >
            <Film className="w-3.5 h-3.5" />
            동영상
          </button>
          {showClickIcon && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="click-icon-bubble">
                {showClickIcon === "play" ? (
                  <Play className="w-8 h-8" />
                ) : (
                  <Pause className="w-8 h-8" />
                )}
              </div>
            </div>
          )}
        </div>

        <div
          ref={mediaContainerRef}
          className={`rounded-lg flex items-center justify-center overflow-hidden relative bg-transparent ${
            mediaMode === "video" ? "shadow-lg" : "shadow-none"
          } ${
            isFullscreen
              ? "w-full h-full max-w-none min-w-0 rounded-none shadow-none"
              : "w-[70%] max-w-[960px] min-w-[320px]"
          }`}
        >
          {mediaMode === "video" ? (
            <>
              {videoSrc ? (
                <video
                  ref={videoRef}
                  src={videoSrc}
                  className="w-full h-auto max-h-full object-contain"
                  muted
                  playsInline
                  onSeeking={() => {}}
                  onSeeked={() => {}}
                  onCanPlay={() => {
                    setIsVideoLoading(false);
                  }}
                  onClick={() => {
                    handleVideoToggle();
                    triggerClickIcon();
                  }}
                  onLoadStart={() => {
                    setIsVideoLoading(true);
                    setVideoError(null);
                  }}
                  onLoadedMetadata={() => {
                    setIsVideoReady(true);
                    setIsVideoLoading(false);
                  }}
                  onWaiting={() => setIsVideoLoading(true)}
                  onPlaying={() => setIsVideoLoading(false)}
                  onError={() => {
                    setIsVideoLoading(false);
                    const mediaError = videoRef.current?.error;
                    console.error("Video playback error", {
                      videoPath,
                      videoSrc,
                      error: mediaError,
                      code: mediaError?.code,
                      message: mediaError?.message,
                    });
                    setVideoError("동영상 재생에 실패했습니다.");
                  }}
                />
              ) : (
                <div className="absolute inset-0 bg-bg-primary/60 backdrop-blur-sm flex items-center justify-center text-sm text-text-muted">
                  동영상 경로를 불러오지 못했습니다.
                </div>
              )}
              {(isVideoLoading || videoError) && (
                <div className="absolute inset-0 bg-bg-primary/60 backdrop-blur-sm flex items-center justify-center text-sm text-text-muted">
                  {videoError ?? "동영상 로딩 중..."}
                </div>
              )}
              {isFullscreen && (
                <div className="absolute left-0 right-0 bottom-0 pb-6 px-8 z-10">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleVideoToggle}
                      className="h-9 w-9 rounded-full text-text-primary shadow-md flex items-center justify-center hover:bg-[#2b2d31] transition-colors"
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                    <div className="flex-1 relative">
                      {fullscreenTooltip.visible && (
                        <div
                          className="absolute -top-7 px-2 py-1 rounded-md text-[11px] text-white bg-[#18191c] shadow-md whitespace-nowrap"
                          style={{ left: `${fullscreenTooltip.left}px`, transform: "translateX(-50%)" }}
                        >
                          {formatDuration(fullscreenTooltip.time)}
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#18191c]" />
                        </div>
                      )}
                      <input
                        ref={fullscreenSliderRef}
                        type="range"
                        min={0}
                        max={Math.max(1, duration)}
                        step={0.1}
                        value={currentTime}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          handleFullscreenSeek(next);
                        }}
                        onMouseEnter={() =>
                          setFullscreenTooltip((prev) => ({ ...prev, visible: true }))
                        }
                        onMouseLeave={() =>
                          setFullscreenTooltip((prev) => ({ ...prev, visible: false }))
                        }
                        onMouseMove={(e) => {
                          if (!fullscreenSliderRef.current) return;
                          const rect = fullscreenSliderRef.current.getBoundingClientRect();
                          const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
                          const percent = rect.width > 0 ? x / rect.width : 0;
                          const time = Math.max(0, duration * percent);
                          setFullscreenTooltip({ visible: true, left: x, time });
                        }}
                        className="w-full discord-slider cursor-pointer"
                        style={{
                          background: `linear-gradient(90deg, #5865f2 ${
                            duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
                          }%, #2f3136 ${
                            duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
                          }%)`,
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => document.exitFullscreen().catch(() => {})}
                      className="h-9 w-9 rounded-full text-text-primary shadow-md flex items-center justify-center hover:bg-[#2b2d31] transition-colors"
                    >
                      <Maximize2 className="w-4 h-4 rotate-180" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div
              className={`aspect-square w-[70%] max-w-[520px] min-w-[240px] rounded-lg bg-hover flex items-center justify-center shadow-lg ${
                isFullscreen ? "w-[50%] max-w-[640px]" : ""
              }`}
              onClick={() => {
                handleVideoToggle();
                triggerClickIcon();
              }}
            >
              {currentSong?.album_art_path ? (
                <AlbumArtImage
                  filePath={currentSong.file_path}
                  path={currentSong.album_art_path}
                  alt={currentSong.title || "Album Art"}
                  className="w-full h-full object-contain"
                  fallback={<Disc3 className="w-12 h-12 text-text-muted/70" />}
                />
              ) : (
                <Disc3 className="w-12 h-12 text-text-muted/70" />
              )}
            </div>
          )}
        </div>

        {videoPath && mediaMode === "video" && (
          <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
            {isSyncOpen && (
              <div className="w-72 rounded-lg border border-border bg-[#2b2d31] shadow-lg p-3">
                <div className="flex items-center justify-between text-xs text-text-muted mb-2">
                  <span>싱크 조절</span>
                  <span>{(syncOffsetMs / 1000).toFixed(1)}s</span>
                </div>
                <div className="relative">
                  {syncTooltip.visible && (
                    <div
                      className="absolute -top-7 px-2 py-1 rounded-md text-[11px] text-white bg-[#18191c] shadow-md whitespace-nowrap"
                      style={{ left: `${syncTooltip.left}px`, transform: "translateX(-50%)" }}
                    >
                      {(syncOffsetMs / 1000).toFixed(1)}s
                    </div>
                  )}
                  <input
                    ref={syncSliderRef}
                    type="range"
                    min={-10000}
                    max={10000}
                    step={100}
                    value={syncOffsetMs}
                    onChange={(e) => setSyncOffsetMs(Number(e.target.value))}
                    onMouseEnter={() =>
                      setSyncTooltip((prev) => ({ ...prev, visible: true }))
                    }
                    onMouseLeave={() =>
                      setSyncTooltip((prev) => ({ ...prev, visible: false }))
                    }
                    onMouseMove={() => {
                      if (!syncSliderRef.current) return;
                      const rect = syncSliderRef.current.getBoundingClientRect();
                      const percent = (syncOffsetMs + 10000) / 20000;
                      const left = rect.width * percent;
                      setSyncTooltip({ visible: true, left });
                    }}
                    style={{
                      background: `linear-gradient(90deg, #5865f2 ${syncPercent}%, #2f3136 ${syncPercent}%)`,
                    }}
                    className="w-full discord-slider cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2 rounded-md border border-border bg-[#232428] p-1">
                    <button
                      type="button"
                      onClick={() => setSyncOffsetMs((prev) => Math.max(-10000, prev - 500))}
                      className="px-2 py-1 text-[11px] rounded-sm text-text-muted hover:text-white hover:bg-[#3f4147] transition-colors"
                    >
                      -0.5s
                    </button>
                    <button
                      type="button"
                      onClick={() => setSyncOffsetMs(0)}
                      className="px-2 py-1 text-[11px] rounded-sm text-text-muted hover:text-white hover:bg-[#3f4147] transition-colors"
                    >
                      초기화
                    </button>
                    <button
                      type="button"
                      onClick={() => setSyncOffsetMs((prev) => Math.min(10000, prev + 500))}
                      className="px-2 py-1 text-[11px] rounded-sm text-text-muted hover:text-white hover:bg-[#3f4147] transition-colors"
                    >
                      +0.5s
                    </button>
                  </div>
                  <div className="text-[11px] text-text-muted">범위: ±10.0s</div>
                </div>
              </div>
            )}
            <div className="relative group">
              <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-[11px] text-white bg-[#18191c] shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                싱크 조절
              </div>
              <button
                type="button"
                onClick={() => setIsSyncOpen((prev) => !prev)}
                className="h-9 w-9 rounded-full border border-border bg-[#2b2d31] text-text-primary shadow-md flex items-center justify-center transition-colors"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
            </div>
            <div className="relative group">
              <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-[11px] text-white bg-[#18191c] shadow-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                {isFullscreen ? "전체화면 종료" : "전체화면"}
              </div>
              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="h-9 w-9 rounded-full border border-border bg-[#2b2d31] text-text-primary shadow-md flex items-center justify-center transition-colors"
              >
                <Maximize2 className={`w-4 h-4 ${isFullscreen ? "text-white" : ""}`} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 우측: 재생 대기열 목록 */}
      <div className="w-80 border-l border-border overflow-y-auto bg-bg-primary h-full flex flex-col">
        <div className="p-4 flex-1 flex flex-col">
          {/* 대기열 목록 */}
          <div
            ref={queueListRef}
            className={`space-y-1 flex-1 flex flex-col ${dragIndex !== null ? "select-none" : ""}`}
          >
            {queue.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-text-muted text-sm text-center">
                  대기열이 비어있습니다.
                </div>
              </div>
            ) : (
              queue.map((song, index) => (
                <div
                  key={`${song.id}-${index}`}
                  className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors group ${
                    index === currentIndex
                      ? "bg-accent/20 text-text-primary"
                      : "text-text-primary"
                  } ${
                    dragOverIndex === index && dragIndex !== index
                      ? "ring-1 ring-accent/60"
                      : ""
                  } ${dragIndex === index ? "opacity-70" : ""}`}
                  onDoubleClick={() => handleSongDoubleClick(index)}
                  onContextMenu={(e) => handleSongContextMenu(e, song, index)}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    dragRowHeightRef.current =
                      (event.currentTarget as HTMLDivElement).getBoundingClientRect().height || 0;
                    setDragIndex(index);
                    setDragOverIndex(index);
                  }}
                >
                  {/* 앨범 커버 미리보기 */}
                  <div className="w-12 h-12 bg-hover rounded flex items-center justify-center flex-shrink-0">
                    {song.album_art_path ? (
                      <AlbumArtImage
                        filePath={song.file_path}
                        path={song.album_art_path}
                        alt={song.title || "Album"}
                        className="w-full h-full object-cover rounded"
                        fallback={<Disc3 className="w-5 h-5 text-text-muted/70" />}
                      />
                    ) : (
                      <Disc3 className="w-5 h-5 text-text-muted/70" />
                    )}
                  </div>

                  {/* 노래 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {song.title || "제목 없음"}
                    </div>
                    <div className="text-xs text-text-muted truncate">
                      {song.artist || "아티스트 없음"}
                    </div>
                  </div>

                  {/* 재생 중 표시 및 재생 시간 */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {index === currentIndex && (
                      <div className="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
                    )}
                    {song.duration && (
                      <div className="text-xs text-text-muted">
                        {formatDuration(song.duration)}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {contextMenu && (
        <SongContextMenu
          song={contextMenu.song}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onRemoveFromQueue={handleRemoveFromQueue}
          onAddToPlaylist={handleAddToPlaylist}
          onEditMetadata={handleEditMetadata}
          onEditTags={handleEditTags}
        />
      )}

      <PlaylistSelectModal
        isOpen={isPlaylistSelectModalOpen}
        onClose={() => {
          setIsPlaylistSelectModalOpen(false);
          setSelectedSongForPlaylist(null);
        }}
        onSelect={handlePlaylistSelect}
        songTitle={selectedSongForPlaylist?.title || undefined}
      />

      <MetadataModal
        isOpen={isMetadataModalOpen}
        song={selectedSongForMetadata}
        onSave={handleMetadataSave}
        onClose={() => {
          setIsMetadataModalOpen(false);
          setSelectedSongForMetadata(null);
        }}
      />

      <TagModal
        isOpen={isTagModalOpen}
        song={selectedSongForTags}
        onSave={handleTagSave}
        onClose={() => {
          setIsTagModalOpen(false);
          setSelectedSongForTags(null);
        }}
      />
    </div>
  );
};

// 재생 시간 포맷 함수
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
