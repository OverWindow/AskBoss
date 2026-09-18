import { create } from "zustand";

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  selectedBossId: string | null;
  chatPanelCollapsed: boolean;
  translatorPanelCollapsed: boolean;
  activeTool: "chat" | "translator";
  tutorialOpen: boolean;
  settingsOpen: boolean;
  set: (patch: Partial<UiState>) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  selectedBossId: null,
  chatPanelCollapsed: false,
  translatorPanelCollapsed: false,
  activeTool: "chat",
  tutorialOpen: false,
  settingsOpen: false,
  set,
}));
