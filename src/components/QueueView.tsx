import { useQueueStore } from "../stores/queueStore";
import { Song } from "../types";

export const QueueView = () => {
  const { queue, currentIndex } = useQueueStore();

  const currentSong = currentIndex !== null ? queue[currentIndex] : null;

  return (
    <div className="h-full w-full flex overflow-hidden bg-bg-primary">
      {/* 좌측: 앨범 커버/동영상 */}
      <div className="flex-1 flex items-center justify-center bg-bg-primary h-full">
        {currentSong?.album_art_path ? (
          <img
            src={currentSong.album_art_path}
            alt={currentSong.title || "Album Art"}
            className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
          />
        ) : (
          <div className="w-96 h-96 bg-hover rounded-lg flex items-center justify-center shadow-lg">
            <span className="text-text-muted text-lg">앨범 커버</span>
          </div>
        )}
      </div>

      {/* 우측: 재생 대기열 목록 */}
      <div className="w-80 border-l border-border overflow-y-auto bg-bg-primary h-full flex flex-col">
        <div className="p-4 flex-1 flex flex-col">
          {/* 대기열 목록 */}
          <div className="space-y-1 flex-1 flex flex-col">
            {queue.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-text-muted text-sm text-center">
                  대기열이 비어있습니다
                </div>
              </div>
            ) : (
              queue.map((song, index) => (
                <div
                  key={`${song.id}-${index}`}
                  className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-colors group ${
                    index === currentIndex
                      ? "bg-accent/20 text-text-primary"
                      : "hover:bg-hover text-text-primary"
                  }`}
                >
                  {/* 앨범 아트 썸네일 */}
                  <div className="w-12 h-12 bg-hover rounded flex items-center justify-center flex-shrink-0">
                    {song.album_art_path ? (
                      <img
                        src={song.album_art_path}
                        alt={song.title || "Album"}
                        className="w-full h-full object-cover rounded"
                      />
                    ) : (
                      <span className="text-text-muted text-xs">앨범</span>
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
    </div>
  );
};

// 재생 시간 포맷팅 함수
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
