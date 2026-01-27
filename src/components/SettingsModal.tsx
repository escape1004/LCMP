import { createRef, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";

type SettingsGroupId = "basic" | "player" | "songs" | "interface";
type SettingsSectionId =
  | "basic"
  | "player-shortcuts"
  | "player-output"
  | "songs"
  | "interface-language"
  | "interface-theme";

const groupLabels: Record<SettingsGroupId, string> = {
  basic: "기본",
  player: "플레이어",
  songs: "노래목록",
  interface: "인터페이스",
};

const sectionLabels: Record<SettingsSectionId, string> = {
  basic: "기본",
  "player-shortcuts": "단축키",
  "player-output": "출력 정보",
  songs: "노래목록",
  "interface-language": "언어",
  "interface-theme": "테마",
};

const groupSections: Record<SettingsGroupId, SettingsSectionId[]> = {
  basic: ["basic"],
  player: ["player-shortcuts", "player-output"],
  songs: ["songs"],
  interface: ["interface-language", "interface-theme"],
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeGroup, setActiveGroup] = useState<SettingsGroupId>("basic");
  const sectionRefs = useMemo(() => {
    return {
      basic: createRef<HTMLDivElement>(),
      "player-shortcuts": createRef<HTMLDivElement>(),
      "player-output": createRef<HTMLDivElement>(),
      songs: createRef<HTMLDivElement>(),
      "interface-language": createRef<HTMLDivElement>(),
      "interface-theme": createRef<HTMLDivElement>(),
    };
  }, []);

  const scrollToSection = (sectionId: SettingsSectionId) => {
    const target = sectionRefs[sectionId]?.current;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-5xl p-0 overflow-hidden gap-0"
        showClose={false}
        overlayClassName="bg-black/60"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <DialogTitle className="text-lg font-bold text-text-primary">환경설정</DialogTitle>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={24} />
          </button>
        </div>
        <div className="flex h-[70vh]">
          <aside className="w-56 bg-bg-sidebar border-r border-border p-3">
            <div className="space-y-1">
              {(Object.keys(groupLabels) as SettingsGroupId[]).map((groupId) => (
                <div key={groupId} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveGroup(groupId);
                      const firstSection = groupSections[groupId][0];
                      scrollToSection(firstSection);
                    }}
                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                      activeGroup === groupId
                        ? "bg-accent text-white"
                        : "text-text-muted hover:bg-hover hover:text-text-primary"
                    }`}
                  >
                    {groupLabels[groupId]}
                  </button>
                  {groupSections[groupId].length > 1 && (
                    <div
                      className={`mt-1 ml-2 overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${
                        activeGroup === groupId ? "max-h-32 opacity-100" : "max-h-0 opacity-0"
                      }`}
                    >
                      <div className="space-y-1">
                        {groupSections[groupId].map((sectionId) => (
                          <button
                            key={sectionId}
                            type="button"
                            onClick={() => scrollToSection(sectionId)}
                            className="w-full text-left px-3 py-1.5 rounded text-xs text-text-muted hover:text-white transition-colors"
                          >
                            {sectionLabels[sectionId]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </aside>

          <div className="flex-1 overflow-y-auto px-6 pb-6 pt-3 space-y-8">
            <section ref={sectionRefs.basic} className="space-y-2">
              <h3 className="text-base font-semibold text-text-primary">기본</h3>
              <p className="text-sm text-text-muted">기본 설정 항목을 준비 중입니다.</p>
            </section>

            <section ref={sectionRefs["player-shortcuts"]} className="space-y-2">
              <h3 className="text-base font-semibold text-text-primary">단축키</h3>
              <p className="text-sm text-text-muted">단축키 설정 기능을 준비 중입니다.</p>
            </section>

            <section ref={sectionRefs["player-output"]} className="space-y-2">
              <h3 className="text-base font-semibold text-text-primary">출력 정보</h3>
              <p className="text-sm text-text-muted">출력 정보 설정을 준비 중입니다.</p>
            </section>

            <section ref={sectionRefs.songs} className="space-y-2">
              <h3 className="text-base font-semibold text-text-primary">노래목록</h3>
              <p className="text-sm text-text-muted">노래목록 관련 설정을 준비 중입니다.</p>
            </section>

            <section ref={sectionRefs["interface-language"]} className="space-y-2">
              <h3 className="text-base font-semibold text-text-primary">언어</h3>
              <p className="text-sm text-text-muted">언어 설정을 준비 중입니다.</p>
            </section>

            <section ref={sectionRefs["interface-theme"]} className="space-y-2">
              <h3 className="text-base font-semibold text-text-primary">테마</h3>
              <p className="text-sm text-text-muted">테마 설정을 준비 중입니다.</p>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
