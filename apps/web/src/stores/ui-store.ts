import { create } from "zustand";

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  selectedBossId: string | null;
  activeWorkspaceTab: "chat" | "translator";
  mobilePanelExpanded: boolean;
  tutorialOpen: boolean;
  settingsOpen: boolean;
  set: (patch: Partial<UiState>) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  selectedBossId: null,
  activeWorkspaceTab: "chat",
  mobilePanelExpanded: true,
  tutorialOpen: false,
  settingsOpen: false,
  set,
}));
