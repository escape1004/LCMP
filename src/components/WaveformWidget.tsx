import { useRef, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { usePlayerStore } from "../stores/playerStore";

export const WaveformWidget = () => {
  const { waveform, currentTime, duration, seek, isLoadingWaveform } = usePlayerStore();
  const waveformRef = useRef<HTMLDivElement>(null);
  const [revealedCount, setRevealedCount] = useState(0);

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current || duration === 0) return;
    
    const rect = waveformRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    
    seek(newTime);
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

  return (
    <div className="w-full h-12 bg-bg-sidebar border-t border-border">
      <div 
        ref={waveformRef}
        className="w-full h-full flex items-center justify-center gap-[2px] px-2 cursor-pointer relative"
        onClick={handleWaveformClick}
      >
        {isLoadingWaveform ? (
          <Loader2 className="w-5 h-5 text-text-muted animate-spin" />
        ) : waveform.length === 0 ? (
          <span className="text-text-muted text-xs">웨이폼 없음</span>
        ) : (
          <>
            {waveform.map((amplitude, index) => {
              const barHeight = Math.max(2, amplitude * 100); // 최소 2px 높이
              const isPast = (index / waveform.length) * 100 < progressPercentage;
              
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
              
              return (
                <div
                  key={index}
                  className="flex-1 bg-hover rounded-sm transition-all relative"
                  style={{
                    height: `${barHeight}%`,
                    backgroundColor: isPast ? '#5865f2' : '#4e5058',
                    filter: `blur(${finalBlur}px)`,
                    opacity: isRevealed ? 1 : 0.3, // 아직 안 보이는 부분은 투명도도 낮춤
                    transition: 'filter 0.1s ease-out, opacity 0.1s ease-out',
                  }}
                />
              );
            })}
            {/* 재생 위치 표시선 */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-accent pointer-events-none"
              style={{ left: `${progressPercentage}%` }}
            />
          </>
        )}
      </div>
    </div>
  );
};
