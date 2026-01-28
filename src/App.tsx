import { useEffect, useState } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { appWindow } from "@tauri-apps/api/window";
import { Sidebar } from "./components/Sidebar";
import { PlaylistView } from "./components/PlaylistView";
import { PlayerControls } from "./components/PlayerControls";
import { QueueView } from "./components/QueueView";
import { WaveformWidget } from "./components/WaveformWidget";
import { ToastContainer } from "./components/ui/toast";
import { TitleBar } from "./components/TitleBar";
import { SettingsModal } from "./components/SettingsModal";
import { useQueueStore } from "./stores/queueStore";
import { usePlayerStore } from "./stores/playerStore";

type PlaybackFinishedPayload = {
  file_path: string;
};

function App() {
  const { isOpen } = useQueueStore();
  const { loadSavedVolume } = usePlayerStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  // 앱 시작 시 저장된 볼륨 불러오기
  useEffect(() => {
    loadSavedVolume();
  }, [loadSavedVolume]);

  useEffect(() => {
    document.body.classList.toggle("window-rounded", !isMaximized);
  }, [isMaximized]);

  useEffect(() => {
    let unlistenResize: UnlistenFn | null = null;
    const syncMaximized = async () => {
      try {
        const maximized = await appWindow.isMaximized();
        setIsMaximized(maximized);
      } catch (error) {
        console.error("Failed to read window state:", error);
      }
    };

    syncMaximized();
    appWindow
      .onResized(() => {
        syncMaximized();
      })
      .then((unlisten) => {
        unlistenResize = unlisten;
      })
      .catch((error) => {
        console.error("Failed to listen window resize:", error);
      });

    return () => {
      if (unlistenResize) {
        unlistenResize();
      }
    };
  }, []);

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    
    listen<PlaybackFinishedPayload>("playback-finished", (event) => {
      const payload = event.payload;
      if (!payload?.file_path) return;
      
      const playerState = usePlayerStore.getState();
      const queueState = useQueueStore.getState();
      const currentSong = playerState.currentSong;
      
      if (!currentSong || currentSong.file_path !== payload.file_path) {
        return;
      }
      
      playerState.setIsPlaying(false);
      if (playerState.duration > 0) {
        playerState.setCurrentTime(playerState.duration);
      }
      
      const queueIndexByFile = queueState.queue.findIndex(
        (song) => song.file_path === payload.file_path
      );
      const effectiveIndex =
        queueIndexByFile >= 0 ? queueIndexByFile : queueState.currentIndex;
      
      if (effectiveIndex === null || effectiveIndex < 0) return;
      
      if (queueIndexByFile >= 0 && queueIndexByFile !== queueState.currentIndex) {
        queueState.setCurrentIndex(queueIndexByFile);
      }
      
      if (playerState.repeat === "one") {
        queueState.playSong(currentSong).catch((err) => {
          console.error("Failed to replay song:", err);
        });
        return;
      }
      
      if (effectiveIndex < queueState.queue.length - 1) {
        queueState.playSongAtIndex(effectiveIndex + 1).catch((err) => {
          console.error("Failed to play next song:", err);
        });
        return;
      }
      
      if (playerState.repeat === "all") {
        queueState.playSongAtIndex(0).catch((err) => {
          console.error("Failed to replay from start:", err);
        });
      }
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch((err) => {
        console.error("Failed to listen for playback-finished:", err);
      });
    
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  return (
    <div
      className={`w-screen h-screen bg-bg-primary text-text-primary font-noto flex flex-col overflow-hidden ${
        isMaximized ? "" : "rounded-lg"
      }`}
    >
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <PlaylistView />
          <div 
            className={`absolute inset-0 bg-bg-primary transform transition-transform duration-300 ease-in-out z-10 ${
              isOpen ? 'translate-y-0' : 'translate-y-full'
            }`}
          >
            <QueueView />
          </div>
        </div>
      </div>

      {/* Waveform Widget (플레이어 위) */}
      <WaveformWidget />

      {/* Player Controls Bar */}
      <PlayerControls />

      {/* Toast Container */}
      <ToastContainer />
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

export default App;
