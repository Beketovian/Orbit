import { useEffect, useState } from "react";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";
import { listenToEvent } from "@/lib/tauri";
import { OrbitMark, HouseIcon, ChartIcon, GearIcon } from "@/components/Icon";
import { OverviewView } from "@/features/overview/OverviewView";
import { HistoryView } from "@/features/history/HistoryView";
import { SettingsView } from "@/features/settings/SettingsView";
import styles from "./MainApp.module.css";

type Section = "overview" | "history" | "settings";

const NAV: { id: Section; label: string; icon: typeof HouseIcon }[] = [
  { id: "overview", label: "Overview", icon: HouseIcon },
  { id: "history", label: "History", icon: ChartIcon },
  { id: "settings", label: "Settings", icon: GearIcon },
];

function initialSection(): Section {
  const hash = window.location.hash.replace("#", "");
  return hash === "history" || hash === "settings" ? hash : "overview";
}

/** The main window: a native-feeling sidebar app with three sections. */
export function MainApp() {
  useAutoRefresh();
  const [section, setSection] = useState<Section>(initialSection);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listenToEvent("orbit://navigate", (payload) => {
      if (payload === "overview" || payload === "history" || payload === "settings") {
        setSection(payload);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  return (
    <div className={styles.root}>
      <nav className={styles.sidebar} aria-label="Sections">
        <div className={styles.brand} data-tauri-drag-region>
          <OrbitMark size={22} />
          <span className={styles.brandName}>Orbit</span>
        </div>
        <ul className={styles.nav}>
          {NAV.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                className={`${styles.navItem} ${section === id ? styles.active : ""}`}
                aria-current={section === id ? "page" : undefined}
                onClick={() => setSection(id)}
              >
                <Icon size={15} />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className={styles.content}>
        {section === "overview" && <OverviewView />}
        {section === "history" && <HistoryView />}
        {section === "settings" && <SettingsView />}
      </main>
    </div>
  );
}
