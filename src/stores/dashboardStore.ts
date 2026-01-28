import { create } from "zustand";

export type DashboardSection = "overall" | "artist" | "tag";

interface DashboardStore {
  section: DashboardSection;
  setSection: (section: DashboardSection) => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  section: "overall",
  setSection: (section) => set({ section }),
}));
