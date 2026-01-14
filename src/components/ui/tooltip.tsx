import { useState, useRef, useEffect, ReactNode } from 'react';

interface TooltipProps {
  children: ReactNode;
  content: string;
  delay?: number;
}

export const Tooltip = ({ children, content, delay = 1500 }: TooltipProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; arrowPosition: 'top' | 'bottom' }>({ top: 0, left: 0, arrowPosition: 'top' });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const calculatePosition = (mouseX: number, mouseY: number) => {
    const offset = 8; // 커서와 툴팁 사이의 간격
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 툴팁이 아직 렌더링되지 않았으면 기본 크기로 계산 (나중에 조정됨)
    const estimatedWidth = 150; // 대략적인 툴팁 너비
    const estimatedHeight = 30; // 대략적인 툴팁 높이

    let left = mouseX;
    let top = mouseY;
    let arrowPosition: 'top' | 'bottom' = 'top';

    // 좌우 경계 체크
    const halfWidth = estimatedWidth / 2;
    if (mouseX - halfWidth < 0) {
      // 왼쪽 경계를 벗어나면 왼쪽 정렬
      left = Math.max(estimatedWidth / 2 + 8, halfWidth);
    } else if (mouseX + halfWidth > viewportWidth) {
      // 오른쪽 경계를 벗어나면 오른쪽 정렬
      left = Math.min(viewportWidth - estimatedWidth / 2 - 8, viewportWidth - halfWidth);
    }

    // 상하 경계 체크
    if (mouseY - estimatedHeight - offset < 0) {
      // 위쪽 경계를 벗어나면 아래쪽에 표시
      top = mouseY + offset;
      arrowPosition = 'bottom';
    } else if (mouseY + estimatedHeight + offset > viewportHeight) {
      // 아래쪽 경계를 벗어나면 위쪽에 표시
      top = Math.max(estimatedHeight + offset, viewportHeight - estimatedHeight - offset);
      arrowPosition = 'top';
    }

    return { top, left, arrowPosition };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
    if (isVisible) {
      const pos = calculatePosition(e.clientX, e.clientY);
      // 실제 툴팁 크기를 사용하여 재계산
      if (tooltipRef.current) {
        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        const tooltipWidth = tooltipRect.width;
        const tooltipHeight = tooltipRect.height;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const offset = 8;

        let left = e.clientX;
        let top = e.clientY;
        let arrowPosition: 'top' | 'bottom' = 'top';

        // 좌우 경계 재계산
        const halfWidth = tooltipWidth / 2;
        if (e.clientX - halfWidth < 0) {
          left = Math.max(tooltipWidth / 2 + 8, halfWidth);
        } else if (e.clientX + halfWidth > viewportWidth) {
          left = Math.min(viewportWidth - tooltipWidth / 2 - 8, viewportWidth - halfWidth);
        }

        // 상하 경계 재계산
        if (e.clientY - tooltipHeight - offset < 0) {
          top = e.clientY + offset;
          arrowPosition = 'bottom';
        } else if (e.clientY + tooltipHeight + offset > viewportHeight) {
          top = Math.max(tooltipHeight + offset, viewportHeight - tooltipHeight - offset);
          arrowPosition = 'top';
        }

        setPosition({ top, left, arrowPosition });
      } else {
        setPosition(pos);
      }
    }
  };

  const showTooltip = (e: React.MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      const pos = calculatePosition(e.clientX, e.clientY);
      setPosition(pos);
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseMove={handleMouseMove}
        onMouseLeave={hideTooltip}
        className="relative"
      >
        {children}
      </div>
      {isVisible && (
        <div
          ref={tooltipRef}
          className="fixed z-50 px-2 py-1.5 text-xs font-medium text-white bg-[#18191c] rounded shadow-lg pointer-events-none whitespace-nowrap"
          style={{
            top: position.arrowPosition === 'top' 
              ? `${position.top - (tooltipRef.current?.offsetHeight || 0) - 8}px`
              : `${position.top + 8}px`,
            left: `${position.left}px`,
            transform: 'translateX(-50%)',
          }}
        >
          {content}
          {position.arrowPosition === 'top' ? (
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#18191c]"></div>
          ) : (
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-[#18191c]"></div>
          )}
        </div>
      )}
    </>
  );
};

