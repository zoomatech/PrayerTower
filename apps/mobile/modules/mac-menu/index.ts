// Menu bar commands for the app on a Mac and on iPad (see ios/MacMenuModule.swift).
// The native module is missing on Android, the web and older builds, so every call is optional.
import { requireOptionalNativeModule, type EventSubscription, type NativeModule } from 'expo';

export type MenuCommand = {
  id: string;
  title: string;
  /** "file", "go" (its own menu after View) or "help". */
  menu: 'file' | 'go' | 'help';
  /** Key used with Command; empty for none. */
  key: string;
  shift?: boolean;
};

declare class MacMenuModule extends NativeModule<{ onCommand: (e: { id: string }) => void }> {
  setCommands(goTitle: string, commands: MenuCommand[]): void;
}

const native = requireOptionalNativeModule<MacMenuModule>('MacMenu');

export const menuBarAvailable = !!native;

export function setMenuCommands(goTitle: string, commands: MenuCommand[]): void {
  native?.setCommands(goTitle, commands);
}

export function addMenuCommandListener(listener: (id: string) => void): EventSubscription | null {
  return native?.addListener('onCommand', (e) => listener(e.id)) ?? null;
}
