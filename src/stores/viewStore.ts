import { create } from "zustand";

export type PrimaryView = "dashboard" | "folders" | "playlists";

interface ViewStore {
  activePrimary: PrimaryView;
  setActivePrimary: (view: PrimaryView) => void;
}

export const useViewStore = create<ViewStore>((set) => ({
  activePrimary: "dashboard",
  setActivePrimary: (view) => set({ activePrimary: view }),
}));
