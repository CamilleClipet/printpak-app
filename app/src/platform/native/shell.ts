import { Capacitor, SystemBarType, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { useExportSheetStore } from '../../state/exportSheetStore';
import { useLyricsSearchStore } from '../../state/lyricsSearchStore';
import { useUiStore } from '../../state/uiStore';
import { dismissRegisteredNativeOverlay } from './backDismissRegistry';

let initialized = false;

export function initPlatform(): void {
  if (initialized || !Capacitor.isNativePlatform()) return;
  initialized = true;
  void configureNativeShell();
}

async function configureNativeShell(): Promise<void> {
  const { App } = await import('@capacitor/app');
  if (Capacitor.getPlatform() === 'android') {
    await App.addListener('backButton', () => {
      if (!dismissNativeOverlay()) void App.exitApp();
    });
  }

  if (Capacitor.getPlatform() === 'ios') {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: Style.Light });
  }

  if (Capacitor.getPlatform() === 'android') {
    await SystemBars.setStyle({ style: SystemBarsStyle.Light, bar: SystemBarType.StatusBar });
  }
}

function dismissNativeOverlay(): boolean {
  if (dismissRegisteredNativeOverlay()) return true;

  const ui = useUiStore.getState();
  const exportSheet = useExportSheetStore.getState();
  const lyrics = useLyricsSearchStore.getState();

  if (ui.cameraOpen) {
    ui.setCameraOpen(false);
    return true;
  }
  if (ui.cropOpen) {
    ui.setCropOpen(false);
    return true;
  }
  if (lyrics.open) {
    lyrics.close();
    return true;
  }
  if (exportSheet.rendering || exportSheet.outputs.length > 0) {
    exportSheet.close();
    return true;
  }
  return false;
}

/** Called from a React effect after the first native UI commit. */
export function hideNativeSplash(): void {
  if (!Capacitor.isNativePlatform()) return;
  void import('@capacitor/splash-screen').then(({ SplashScreen }) => SplashScreen.hide());
}
