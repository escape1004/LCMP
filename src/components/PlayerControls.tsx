import { Play, Pause, SkipBack, SkipForward, Volume2, ChevronUp, ChevronDown } from "lucide-react";
import { useQueueStore } from "../stores/queueStore";

export const PlayerControls = () => {
  const isPlaying = false;
  const { isOpen, toggleQueue } = useQueueStore();

  return (
    <div className="bg-bg-sidebar border-t border-border">
      {/* 플레이어 컨트롤 */}
      <div 
        className="h-24 px-4 py-2 flex items-center gap-4"
        onClick={toggleQueue}
      >
        {/* Album Art & Song Info */}
        <div 
          className="flex items-center gap-3 min-w-[200px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-14 h-14 bg-hover rounded flex items-center justify-center">
            <span className="text-text-muted text-xs">앨범</span>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="text-sm font-medium text-text-primary truncate">
              노래 제목
            </div>
            <div className="text-xs text-text-muted truncate">
              아티스트
            </div>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex-1 flex items-center justify-center gap-2">
          <button 
            className="p-2 hover:bg-hover rounded transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <SkipBack size={20} className="text-text-primary" />
          </button>
          <button 
            className="p-2 hover:bg-hover rounded transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {isPlaying ? (
              <Pause size={24} className="text-text-primary" />
            ) : (
              <Play size={24} className="text-text-primary" />
            )}
          </button>
          <button 
            className="p-2 hover:bg-hover rounded transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <SkipForward size={20} className="text-text-primary" />
          </button>
        </div>

        {/* Volume Control */}
        <div 
          className="flex items-center gap-2 min-w-[120px]"
          onClick={(e) => e.stopPropagation()}
        >
          <Volume2 size={18} className="text-text-muted" />
          <div className="flex-1 h-1 bg-hover rounded-full">
            <div className="h-full bg-accent rounded-full" style={{ width: "50%" }}></div>
          </div>
        </div>

        {/* Queue Toggle Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleQueue();
          }}
          className="p-2 hover:bg-hover rounded transition-colors"
          title={isOpen ? "대기열 숨기기" : "대기열 보기"}
        >
          <div className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : 'rotate-0'}`}>
            <ChevronUp size={20} className="text-text-primary" />
          </div>
        </button>
      </div>
    </div>
  );
};
