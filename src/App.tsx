import { getWindowKind } from "@/lib/tauri";
import { PanelApp } from "@/features/panel/PanelApp";
import { MainApp } from "@/features/main/MainApp";

/** Route by window: the tray panel or the main sidebar window. */
export function App() {
  return getWindowKind() === "panel" ? <PanelApp /> : <MainApp />;
}
