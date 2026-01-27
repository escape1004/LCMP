import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, ChevronUp, Shuffle, Repeat, Repeat1, Disc3 } from "lucide-react";
import { useQueueStore } from "../stores/queueStore";
import { usePlayerStore } from "../stores/playerStore";
import { useEffect, useRef, useState } from "react";
import { Tooltip } from "./ui/tooltip";
import { invoke } from "@tauri-apps/api/tauri";
import { AlbumArtImage } from "./AlbumArtImage";

export const PlayerControls = () => {
  const { isOpen, toggleQueue, queue, currentIndex, playNext, playPrevious } = useQueueStore();
  const { 
    isPlaying, 
    currentSong, 
    duration, 
    volume, 
    isMuted,
    shuffle,
    repeat,
    togglePlayPause, 
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleRepeat
  } = usePlayerStore();

  // 현재 재생 중인 노래 정보
  const displaySong = currentSong || (currentIndex !== null ? queue[currentIndex] : null);

  // 제목이 길어서 애니메이션이 필요한지 확인
  const title = displaySong?.title || "노래 제목";
  const artist = displaySong?.artist || "아티스트";
  const album = displaySong?.album || null;
  const titleContainerRef = useRef<HTMLDivElement>(null);
  const titleTextRef = useRef<HTMLSpanElement>(null);
  const [needsMarquee, setNeedsMarquee] = useState(false);
  
  // 오디오 포맷 정보
  const [audioFormat, setAudioFormat] = useState<{
    format: string;
    sampleRate: number | null;
    bitrate: number | null;
    channels: number | null;
  } | null>(null);
  
  // 볼륨 드래그 상태
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [dragVolume, setDragVolume] = useState(volume);
  const volumeBarRef = useRef<HTMLDivElement>(null);
  
  const checkMarquee = () => {
    if (titleContainerRef.current && titleTextRef.current) {
      const container = titleContainerRef.current;
      const text = titleTextRef.current;
      
      // 제목 영역의 실제 위치 확인
      const containerRect = container.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const centerX = windowWidth / 2;
      const buttonAreaWidth = 150; // 가운데 버튼 영역 너비 (여유있게)
      const buttonLeftEdge = centerX - buttonAreaWidth / 2;
      
      // 제목 영역의 오른쪽 끝이 가운데 버튼 영역과 겹치는지 확인
      const titleRightEdge = containerRect.right;
      const textWidth = text.scrollWidth;
      const containerWidth = container.offsetWidth;
      
      // 제목 영역이 가운데 버튼 영역과 겹치는지 확인
      const overlapsButton = titleRightEdge > buttonLeftEdge;
      
      // 텍스트가 컨테이너를 넘치고, 버튼 영역과 겹칠 때만 애니메이션 적용
      setNeedsMarquee(textWidth > containerWidth && overlapsButton);
    }
  };

  useEffect(() => {
    checkMarquee();
    
    // 윈도우 크기 변경 시에도 다시 계산
    window.addEventListener('resize', checkMarquee);
    
    return () => {
      window.removeEventListener('resize', checkMarquee);
    };
  }, [title]);

  // 볼륨 드래그 핸들러
  const handleVolumeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingVolume(true);
    if (volumeBarRef.current) {
      const rect = volumeBarRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const newVolume = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setDragVolume(newVolume);
      setVolume(newVolume);
    }
  };

  // 볼륨 휠 핸들러
  const handleVolumeWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const delta = e.deltaY > 0 ? -5 : 5; // 아래로 스크롤하면 감소, 위로 스크롤하면 증가
    const currentVol = isMuted ? 0 : (isDraggingVolume ? dragVolume : volume);
    const newVolume = Math.max(0, Math.min(100, currentVol + delta));
    setVolume(newVolume);
    if (isMuted && newVolume > 0) {
      // 볼륨이 0보다 크면 음소거 해제
      toggleMute();
    }
  };

  useEffect(() => {
    if (!isDraggingVolume) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (volumeBarRef.current) {
        const rect = volumeBarRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const newVolume = Math.max(0, Math.min(100, (x / rect.width) * 100));
        setDragVolume(newVolume);
        setVolume(newVolume);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingVolume(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingVolume, setVolume]);

  // 오디오 포맷 정보 가져오기
  useEffect(() => {
    if (!displaySong?.file_path) {
      setAudioFormat(null);
      return;
    }

    const fetchAudioFormat = async () => {
      try {
        const [format, sampleRate, bitrate, channels] = await invoke<[string, number | null, number | null, number | null]>(
          'get_audio_format_info',
          { filePath: displaySong.file_path }
        );
        
        setAudioFormat({
          format,
          sampleRate,
          bitrate,
          channels,
        });
      } catch (error) {
        console.error('Failed to get audio format info:', error);
        setAudioFormat(null);
      }
    };

    fetchAudioFormat();
  }, [displaySong?.file_path]);

  // 오디오 포맷 정보 포맷팅
  const formatAudioInfo = () => {
    if (!audioFormat) return null;
    
    const parts: string[] = [audioFormat.format];
    
    if (audioFormat.sampleRate) {
      const sampleRateKHz = (audioFormat.sampleRate / 1000).toFixed(0);
      parts.push(`${sampleRateKHz}kHz`);
    }
    
    if (audioFormat.bitrate) {
      parts.push(`${audioFormat.bitrate}kbps`);
    }
    
    if (audioFormat.channels) {
      const channelName = audioFormat.channels === 1 ? 'Mono' : 
                         audioFormat.channels === 2 ? 'Stereo' : 
                         `${audioFormat.channels}ch`;
      parts.push(channelName);
    }
    
    return parts.join(', ');
  };

  return (
    <div className="bg-bg-sidebar border-t border-border">
      {/* 플레이어 컨트롤 */}
      <div 
        className="h-24 px-4 py-2 flex items-center"
        onClick={toggleQueue}
      >
        {/* Album Art & Song Info - 왼쪽 영역 */}
        <div 
          className="flex items-center gap-3 flex-1 min-w-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-16 h-16 bg-hover rounded flex items-center justify-center flex-shrink-0">
            {displaySong?.album_art_path ? (
              <AlbumArtImage
                filePath={displaySong.file_path}
                path={displaySong.album_art_path}
                alt={displaySong.title || "Album"}
                className="w-full h-full object-cover rounded"
                fallback={<Disc3 className="w-6 h-6 text-text-muted/70" />}
              />
            ) : (
              <Disc3 className="w-6 h-6 text-text-muted/70" />
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <div 
              ref={titleContainerRef}
              className="text-sm font-medium text-text-primary overflow-hidden relative"
            >
              {needsMarquee ? (
                <div className="marquee-container">
                  <div className="marquee-content">
                    <span ref={titleTextRef} className="marquee-text">{title}</span>
                    <span className="marquee-text">{title}</span>
                  </div>
                </div>
              ) : (
                <span ref={titleTextRef} className="truncate block">{title}</span>
              )}
            </div>
            <div className="text-xs text-text-muted truncate">
              {artist}
            </div>
            {album && (
              <div className="text-xs text-text-muted truncate">
                {album}
              </div>
            )}
            {audioFormat && (
              <div className="text-xs text-text-muted truncate">
                {formatAudioInfo()}
              </div>
            )}
          </div>
        </div>

        {/* Playback Controls - 가운데 영역 (고정 너비) */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Tooltip content="이전 트랙">
            <button 
              className="p-2 hover:bg-hover rounded transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
              onClick={async (e) => {
                e.stopPropagation();
                await playPrevious();
              }}
              disabled={currentIndex === null || (repeat === 'off' && currentIndex === 0)}
            >
              <SkipBack size={20} className="text-text-primary" />
            </button>
          </Tooltip>
          <Tooltip content={isPlaying ? "일시정지" : "재생"}>
            <button 
              className="p-2 hover:bg-hover rounded transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
              onClick={async (e) => {
                e.stopPropagation();
                await togglePlayPause();
              }}
              disabled={!displaySong}
            >
              {isPlaying ? (
                <Pause size={24} className="text-text-primary" />
              ) : (
                <Play size={24} className="text-text-primary" />
              )}
            </button>
          </Tooltip>
          <Tooltip content="다음 트랙">
            <button 
              className="p-2 hover:bg-hover rounded transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
              onClick={async (e) => {
                e.stopPropagation();
                await playNext();
              }}
              disabled={currentIndex === null || (repeat === 'off' && currentIndex === queue.length - 1)}
            >
              <SkipForward size={20} className="text-text-primary" />
            </button>
          </Tooltip>
        </div>

        {/* Right Side Controls - 오른쪽 영역 */}
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          {/* Shuffle & Repeat Controls */}
          <div 
            className="flex items-center gap-1 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip content={shuffle ? "셔플 끄기" : "셔플 켜기"}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const { shuffleQueue, unshuffleQueue } = useQueueStore.getState();
                  if (shuffle) {
                    unshuffleQueue();
                  } else {
                    shuffleQueue();
                  }
                  toggleShuffle();
                }}
                className={`p-1.5 hover:bg-hover rounded transition-colors ${shuffle ? 'text-white' : 'text-text-muted'}`}
              >
                <Shuffle size={16} />
              </button>
            </Tooltip>
            <Tooltip content={
              repeat === 'off' ? "반복 끄기" :
              repeat === 'all' ? "전체 반복" :
              "1곡 반복"
            }>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleRepeat();
                }}
                className={`p-1.5 hover:bg-hover rounded transition-colors ${repeat !== 'off' ? 'text-white' : 'text-text-muted'}`}
              >
                {repeat === 'one' ? (
                  <Repeat1 size={16} />
                ) : (
                  <Repeat size={16} />
                )}
              </button>
            </Tooltip>
          </div>

          {/* Volume Control */}
          <div 
            className="flex items-center gap-2 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip content={isMuted ? "음소거 해제" : "음소거"}>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  await toggleMute();
                }}
                className="p-1 hover:bg-hover rounded transition-colors"
              >
                {isMuted ? (
                  <VolumeX size={18} className="text-text-muted" />
                ) : (
                  <Volume2 size={18} className="text-white" />
                )}
              </button>
            </Tooltip>
            <Tooltip content={`볼륨: ${Math.round(isMuted ? 0 : (isDraggingVolume ? dragVolume : volume))}%`} delay={0}>
              <div 
                ref={volumeBarRef}
                className="w-24 h-1 bg-hover rounded-full cursor-pointer relative group"
                onMouseDown={handleVolumeMouseDown}
                onWheel={handleVolumeWheel}
                onClick={(e) => {
                  e.stopPropagation();
                  if (volumeBarRef.current) {
                    const rect = volumeBarRef.current.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const newVolume = Math.max(0, Math.min(100, (x / rect.width) * 100));
                    setVolume(newVolume);
                  }
                }}
              >
                <div 
                  className="h-full bg-accent rounded-full transition-all relative" 
                  style={{ width: `${isMuted ? 0 : (isDraggingVolume ? dragVolume : volume)}%` }}
                >
                  {/* 동그란 손잡이 */}
                  <div
                    className="absolute right-0 top-1/2 transform -translate-y-1/2 translate-x-1/2 w-3 h-3 bg-accent rounded-full border-2 border-white shadow-md"
                    style={{ 
                      display: isMuted ? 'none' : 'block'
                    }}
                  ></div>
                </div>
              </div>
            </Tooltip>
          </div>

          {/* Queue Toggle Button */}
          <Tooltip content={isOpen ? "대기열 숨기기" : "대기열 보기"}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleQueue();
              }}
              className="p-2 hover:bg-hover rounded transition-colors"
            >
              <div className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
                <ChevronUp size={20} className="text-text-primary" />
              </div>
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

