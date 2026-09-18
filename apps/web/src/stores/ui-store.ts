import { create } from "zustand";

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  selectedBossId: string | null;
  chatPanelOpen: boolean;
  translatorPanelOpen: boolean;
  lastOpenedPanel: "chat" | "translator";
  tutorialOpen: boolean;
  settingsOpen: boolean;
  set: (patch: Partial<UiState>) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  selectedBossId: null,
  chatPanelOpen: false,
  translatorPanelOpen: false,
  lastOpenedPanel: "chat",
  tutorialOpen: false,
  settingsOpen: false,
  set,
}));
