import { create } from "zustand";

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  selectedBossId: string | null;
  activeWorkspaceTab: "chat" | "translator";
  mobilePanelExpanded: boolean;
  tutorialOpen: boolean;
  settingsOpen: boolean;
  archiveOpen: boolean;
  set: (patch: Partial<UiState>) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  selectedBossId: null,
  activeWorkspaceTab: "translator",
  mobilePanelExpanded: false,
  tutorialOpen: false,
  settingsOpen: false,
  archiveOpen: false,
  set,
}));
