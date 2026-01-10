import { Sidebar } from "./components/Sidebar";
import { PlaylistView } from "./components/PlaylistView";
import { PlayerControls } from "./components/PlayerControls";
import { QueueView } from "./components/QueueView";
import { WaveformWidget } from "./components/WaveformWidget";
import { useQueueStore } from "./stores/queueStore";

function App() {
  const { isOpen } = useQueueStore();

  return (
    <div className="w-screen h-screen bg-bg-primary text-text-primary font-noto flex flex-col overflow-hidden">
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
    </div>
  );
}

export default App;
