import { useEffect, useState } from "react";
import { appWindow } from "@tauri-apps/api/window";
import appIcon from "../assets/app-icon.png";

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setIsMaximized).catch(() => setIsMaximized(false));
  }, []);

  const handleToggleMaximize = async () => {
    await appWindow.toggleMaximize();
    const maximized = await appWindow.isMaximized();
    setIsMaximized(maximized);
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".titlebar-no-drag")) return;
    appWindow.startDragging().catch(() => undefined);
  };

  return (
    <div
      className="relative h-8 bg-[#2B2D31] text-[#949BA4] flex items-center select-none titlebar-drag"
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
    >
      <div
        className="absolute top-0 left-0 right-0 h-1 titlebar-no-drag"
        style={{ cursor: "ns-resize" }}
      />
      <div className="relative flex items-center h-full px-2 titlebar-no-drag">
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex items-center gap-2">
          <img src={appIcon} alt="앱 아이콘" className="w-[18px] h-[18px]" />
          <span className="text-sm font-medium text-[#949BA4]">LCMP</span>
        </div>
      </div>

      <div className="flex-1 h-full" />

      <div className="flex items-center h-full titlebar-no-drag">
        <button
          type="button"
          className="w-12 h-full flex items-center justify-center hover:bg-[#404249] hover:text-white transition-colors"
          aria-label="환경설정"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.23-1.13.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.3-.06.61-.06.94s.02.64.06.94L2.82 14.52a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.4 1.04.71 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.59-.23 1.13-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" />
          </svg>
        </button>
        <button
          type="button"
          className="w-12 h-full flex items-center justify-center hover:bg-[#404249] hover:text-white transition-colors"
          onClick={() => appWindow.minimize()}
          aria-label="최소화"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
            <path d="M14 8v1H3V8h11z" />
          </svg>
        </button>
        <button
          type="button"
          className="w-12 h-full flex items-center justify-center hover:bg-[#404249] hover:text-white transition-colors"
          onClick={handleToggleMaximize}
          aria-label="최대화/복원"
        >
          {isMaximized ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M3 3v10h10V3H3zm9 9H4V4h8v8z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M3 3h10v10H3V3z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className="w-12 h-full flex items-center justify-center hover:bg-[#DA373C] hover:text-white transition-colors"
          onClick={() => appWindow.close()}
          aria-label="닫기"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
            <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
