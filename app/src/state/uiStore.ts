import { create } from 'zustand';

interface UiStore {
  cameraOpen: boolean;
  setCameraOpen: (open: boolean) => void;
  liveView: boolean;
  setLiveView: (open: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  cropOpen: boolean;
  setCropOpen: (open: boolean) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  cameraOpen: false,
  setCameraOpen: (open) => set({ cameraOpen: open }),
  liveView: false,
  setLiveView: (open) => set({ liveView: open }),
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  cropOpen: false,
  setCropOpen: (open) => set({ cropOpen: open }),
}));
