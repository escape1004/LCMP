import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, ChevronUp, Shuffle, Repeat, Repeat1 } from "lucide-react";
import { useQueueStore } from "../stores/queueStore";
import { usePlayerStore } from "../stores/playerStore";
import { useEffect, useRef, useState } from "react";
import { Tooltip } from "./ui/tooltip";

export const PlayerControls = () => {
  const { isOpen, toggleQueue, queue, currentIndex, playNext, playPrevious } = useQueueStore();
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
              className="p-2 hover:bg-hover rounded transition-colors"
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
            <div 
              className="w-24 h-1 bg-hover rounded-full cursor-pointer relative"
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const newVolume = Math.max(0, Math.min(100, (x / rect.width) * 100));
                setVolume(newVolume);
              }}
            >
              <div 
                className="h-full bg-accent rounded-full transition-all" 
                style={{ width: `${isMuted ? 0 : volume}%` }}
              ></div>
            </div>
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
