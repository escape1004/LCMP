import { useState, useRef, useEffect, ReactNode } from 'react';

interface TooltipProps {
  children: ReactNode;
  content: string;
  delay?: number;
}

export const Tooltip = ({ children, content, delay = 1500 }: TooltipProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
    if (isVisible) {
      // 커서 위치에 바로 붙어서 표시
      const left = e.clientX;
      const top = e.clientY;
      
      setPosition({ top, left });
    }
  };

  const showTooltip = (e: React.MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      // 커서 위치에 바로 붙어서 표시
      const left = e.clientX;
      const top = e.clientY;
      
      setPosition({ top, left });
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
            top: `${position.top}px`,
            left: `${position.left}px`,
            transform: 'translate(-50%, calc(-100% - 8px))',
          }}
        >
          {content}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#18191c]"></div>
        </div>
      )}
    </>
  );
};

