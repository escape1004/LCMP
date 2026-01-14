import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, ChevronUp, Shuffle, Repeat, Repeat1 } from "lucide-react";
import { useQueueStore } from "../stores/queueStore";
import { usePlayerStore } from "../stores/playerStore";
import { useEffect, useRef, useState } from "react";
import { Tooltip } from "./ui/tooltip";

export const PlayerControls = () => {
  const { isOpen, toggleQueue, queue, currentIndex, playNext, playPrevious, playSong } = useQueueStore();
  const { 
    isPlaying, 
    currentSong, 
    currentTime, 
    duration, 
    volume, 
    isMuted,
    shuffle,
    repeat,
    togglePlayPause, 
    seek, 
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
  const titleContainerRef = useRef<HTMLDivElement>(null);
  const titleTextRef = useRef<HTMLSpanElement>(null);
  const [needsMarquee, setNeedsMarquee] = useState(false);
  
  // 볼륨 드래그 상태
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [dragVolume, setDragVolume] = useState(volume);
  const volumeBarRef = useRef<HTMLDivElement>(null);
  
  // 재생 종료 감지 및 다음 곡 자동 재생
  const prevIsPlayingRef = useRef(isPlaying);
  const hasAutoPlayedNextRef = useRef(false);
  
  useEffect(() => {
    // 재생이 끝났는지 확인 (isPlaying이 true에서 false로 변경되고, currentTime이 duration에 근접)
    const wasPlaying = prevIsPlayingRef.current;
    const nowPlaying = isPlaying;
    
    // 재생이 끝났고 (true -> false), 곡이 있고, 시간이 duration에 근접한 경우
    if (wasPlaying && !nowPlaying && currentSong && duration > 0) {
      // currentTime이 duration의 95% 이상이거나, duration에 근접한 경우 (1초 이내)
      const progress = currentTime / duration;
      const timeDiff = Math.abs(currentTime - duration);
      
      // duration에 근접하거나 (1초 이내) 또는 currentTime이 duration의 95% 이상일 때
      if (timeDiff <= 1.0 || currentTime >= duration || progress >= 0.95) {
        // 중복 실행 방지
        if (!hasAutoPlayedNextRef.current) {
          hasAutoPlayedNextRef.current = true;
          
          // 약간의 지연 후 다음 곡 재생 (상태 업데이트 완료 대기)
          setTimeout(() => {
            // 다음 곡 재생 (반복 모드 고려)
            const { repeat } = usePlayerStore.getState();
            const state = useQueueStore.getState();
            
            if (state.currentIndex !== null) {
              if (repeat === 'one') {
                // 1곡 반복: 같은 곡 다시 재생
                playSong(currentSong).catch(err => {
                  console.error('Failed to replay song:', err);
                  hasAutoPlayedNextRef.current = false;
                });
              } else if (state.currentIndex < state.queue.length - 1) {
                // 다음 곡 재생
                playNext().catch(err => {
                  console.error('Failed to play next song:', err);
                  hasAutoPlayedNextRef.current = false;
                });
              } else if (repeat === 'all') {
                // 전체 반복: 처음부터 다시
                useQueueStore.getState().playSongAtIndex(0).catch(err => {
                  console.error('Failed to replay from start:', err);
                  hasAutoPlayedNextRef.current = false;
                });
              } else {
                // 반복 모드가 off이고 마지막 곡이면 일시정지 상태로 전환
                hasAutoPlayedNextRef.current = false;
                // 일시정지 상태로 전환
                usePlayerStore.getState().pause().catch(err => {
                  console.error('Failed to pause after last song:', err);
                });
              }
            }
          }, 100); // 100ms 지연
        }
      }
    } else if (nowPlaying) {
      // 재생이 시작되면 플래그 리셋
      hasAutoPlayedNextRef.current = false;
    }
    
    prevIsPlayingRef.current = nowPlaying;
  }, [isPlaying, currentSong, currentTime, duration, playNext, playSong]);
  
  // ✅ 추가: currentTime이 duration에 도달했는지 주기적으로 확인 (백엔드 상태와 무관하게)
  useEffect(() => {
    if (!isPlaying || !currentSong || duration <= 0) {
      return;
    }
    
    // currentTime이 duration에 도달했는지 확인
    const checkInterval = setInterval(() => {
      const { currentTime: ct, duration: dur, isPlaying: playing } = usePlayerStore.getState();
      
      // 재생 중이고, currentTime이 duration에 도달했거나 약간 초과한 경우
      if (playing && dur > 0 && ct >= dur - 0.1) {
        // 백엔드 상태 확인 (isPlaying이 false인지)
        // 하지만 백엔드에서 isPlaying 상태를 직접 확인할 수 없으므로,
        // currentTime이 duration에 도달했다고 가정하고 다음 곡 재생
        if (!hasAutoPlayedNextRef.current) {
          hasAutoPlayedNextRef.current = true;
          
          setTimeout(() => {
            const { repeat } = usePlayerStore.getState();
            const state = useQueueStore.getState();
            
            if (state.currentIndex !== null) {
              if (repeat === 'one') {
                playSong(currentSong).catch(err => {
                  console.error('Failed to replay song:', err);
                  hasAutoPlayedNextRef.current = false;
                });
              } else if (state.currentIndex < state.queue.length - 1) {
                playNext().catch(err => {
                  console.error('Failed to play next song:', err);
                  hasAutoPlayedNextRef.current = false;
                });
              } else if (repeat === 'all') {
                useQueueStore.getState().playSongAtIndex(0).catch(err => {
                  console.error('Failed to replay from start:', err);
                  hasAutoPlayedNextRef.current = false;
                });
              } else {
                // 반복 모드가 off이고 마지막 곡이면 일시정지 상태로 전환
                hasAutoPlayedNextRef.current = false;
                // 일시정지 상태로 전환
                usePlayerStore.getState().pause().catch(err => {
                  console.error('Failed to pause after last song:', err);
                });
              }
            }
          }, 100);
        }
      }
    }, 500); // 500ms마다 확인
    
    return () => clearInterval(checkInterval);
  }, [isPlaying, currentSong, duration, playNext, playSong]);

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
          <div className="w-14 h-14 bg-hover rounded flex items-center justify-center flex-shrink-0">
            {displaySong?.album_art_path ? (
              <img
                src={displaySong.album_art_path}
                alt={displaySong.title || "Album"}
                className="w-full h-full object-cover rounded"
              />
            ) : (
              <span className="text-text-muted text-xs">앨범</span>
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

