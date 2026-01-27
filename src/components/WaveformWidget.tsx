import { useRef, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { usePlayerStore } from "../stores/playerStore";

const formatDuration = (seconds: number | null): string => {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return '--:--';
  if (seconds === 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const WaveformWidget = () => {
  const { waveform, currentTime, duration, seek, isLoadingWaveform, currentSong, isPlaying, setCurrentTime } = usePlayerStore();
  const waveformRef = useRef<HTMLDivElement>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null);

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current || duration === 0) return;
    
    const rect = waveformRef.current.getBoundingClientRect();
    const padding = 48; // px-12 = 3rem = 48px (좌우 각각)
    const x = e.clientX - rect.left - padding; // 패딩 제외
    const waveformWidth = rect.width - (padding * 2); // 실제 웨이브 영역 너비
    
    // 웨이브 영역 내부인지 확인
    if (x < 0 || x > waveformWidth) return;
    
    const percentage = x / waveformWidth;
    const newTime = percentage * duration;
    
    seek(newTime);
  };

  const handleWaveformMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current || duration === 0) {
      setHoverTime(null);
      setHoverPosition(null);
      return;
    }
    
    const rect = waveformRef.current.getBoundingClientRect();
    const padding = 48; // px-12 = 3rem = 48px (좌우 각각)
    const x = e.clientX - rect.left - padding; // 패딩 제외
    const waveformWidth = rect.width - (padding * 2); // 실제 웨이브 영역 너비
    
    // 웨이브 영역 내부인지 확인
    if (x < 0 || x > waveformWidth) {
      setHoverTime(null);
      setHoverPosition(null);
      return;
    }
    
    const percentage = Math.max(0, Math.min(1, x / waveformWidth));
    const time = percentage * duration;
    
    setHoverTime(time);
    setHoverPosition({ x: e.clientX, y: e.clientY });
  };

  const handleWaveformMouseLeave = () => {
    setHoverTime(null);
    setHoverPosition(null);
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  // 웨이폼이 로드되면 앞부분부터 순차적으로 블러 제거
  // 웨이폼 데이터가 있으면 즉시 앞부분부터 렌더링 시작
  useEffect(() => {
    if (waveform.length === 0) {
      setRevealedCount(0);
      return;
    }

    // 웨이폼 데이터가 있으면 즉시 앞부분부터 블러 제거 시작
    // (웨이폼이 일부라도 보이기 시작하면 재생이 시작되므로 빠르게 표시)
    if (waveform.length > 0) {
      // 빠른 애니메이션: 각 바당 약 3ms (150개면 약 0.45초)
      const revealSpeed = 3;
      const totalBars = waveform.length;
      
      if (revealedCount < totalBars) {
        const timer = setInterval(() => {
          setRevealedCount((prev) => {
            if (prev >= totalBars) {
              clearInterval(timer);
              return totalBars;
            }
            return prev + 1;
          });
        }, revealSpeed);

        return () => clearInterval(timer);
      }
    }
  }, [waveform.length, isLoadingWaveform]);

  // 웨이폼이 변경되면 리셋
  useEffect(() => {
    setRevealedCount(0);
  }, [waveform]);

  // 재생 중일 때 프론트엔드에서만 시간 증가 (백엔드 재생 제어와 완전히 분리)
  useEffect(() => {
    // 기존 interval 정리
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }

    // 재생 중이고 노래가 있을 때만 시간 증가
    if (!isPlaying || !currentSong) {
      return;
    }

    // duration이 0이 아니면 duration까지, 0이면 무제한으로 증가
    progressIntervalRef.current = setInterval(() => {
      setCurrentTime((prev) => {
        if (duration > 0) {
          const newTime = prev + 0.1;
          return newTime >= duration ? duration : newTime;
        } else {
          // duration이 없으면 계속 증가 (나중에 duration이 설정되면 자동으로 멈춤)
          return prev + 0.1;
        }
      });
    }, 100); // 100ms마다 0.1초 증가

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [isPlaying, currentSong?.id, duration, setCurrentTime]);

  return (
    <div className="w-full h-16 bg-bg-sidebar border-t border-border relative">
      {/* 호버 툴팁 */}
      {hoverTime !== null && hoverPosition && (
        <div
          className="fixed z-50 px-2 py-1.5 text-xs font-medium text-white bg-[#18191c] rounded shadow-lg pointer-events-none whitespace-nowrap"
          style={{
            top: `${hoverPosition.y}px`,
            left: `${hoverPosition.x}px`,
            transform: 'translate(-50%, calc(-100% - 8px))',
          }}
        >
          {formatDuration(hoverTime)}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#18191c]"></div>
        </div>
      )}
      
      <div 
        ref={waveformRef}
        className={`w-full h-full flex items-center justify-center gap-[2px] px-12 py-2 relative ${
          currentSong ? 'cursor-pointer' : 'cursor-default'
        }`}
        onClick={currentSong ? handleWaveformClick : undefined}
        onMouseMove={currentSong ? handleWaveformMouseMove : undefined}
        onMouseLeave={currentSong ? handleWaveformMouseLeave : undefined}
      >
        {/* 시간 표시 - 좌측 현재 시간, 우측 전체 시간 - 웨이폼 좌우 끝에 배치 */}
        {currentSong && (
          <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none z-10">
            <span className="text-xs text-text-muted font-medium">
              {formatDuration(currentTime)}
            </span>
            <span className="text-xs text-text-muted font-medium">
              {formatDuration(duration)}
            </span>
          </div>
        )}
        {isLoadingWaveform ? (
          <Loader2 className="w-5 h-5 text-text-muted animate-spin" />
        ) : waveform.length === 0 ? (
          <span className="text-text-muted text-sm">
            {currentSong ? "웨이폼 없음" : "노래를 재생해주세요."}
          </span>
        ) : (
          <>
            {waveform.map((amplitude, index) => {
              const barHeight = Math.max(2, amplitude * 100); // 최소 2px 높이
              const barPosition = (index / waveform.length) * 100;
              const isPast = barPosition < progressPercentage;
              
              // 블러 처리: 아직 렌더링되지 않은 부분은 블러, 렌더링된 부분은 점점 선명하게
              const isRevealed = index < revealedCount;
              // 블러 계산: revealedCount와의 거리에 따라 블러 강도 결정
              // 마지막 부분도 완전히 선명하게 만들기 위해 더 빠르게 블러 제거
              const distanceFromReveal = revealedCount - index;
              const blurAmount = isRevealed 
                ? Math.max(0, 8 - distanceFromReveal * 0.8) // 더 빠르게 블러 제거
                : 8; // 아직 렌더링 안 된 부분은 블러
              
              // 모든 바가 렌더링되면 블러 완전 제거
              const finalBlur = revealedCount >= waveform.length ? 0 : blurAmount;
              
              // 진행도 색상: 더 명확한 대비를 위해 밝은 파란색 사용
              const progressColor = isPast ? '#5865f2' : '#4e5058';
              
              return (
                <div
                  key={index}
                  className="flex-1 rounded-sm transition-all relative"
                  style={{
                    height: `${barHeight}%`,
                    backgroundColor: progressColor,
                    filter: `blur(${finalBlur}px)`,
                    opacity: isRevealed ? 1 : 0.3,
                    transition: 'background-color 0.1s ease-out, filter 0.1s ease-out, opacity 0.1s ease-out',
                  }}
                />
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

