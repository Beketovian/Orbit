import { useUsageStore } from "@/store/usageStore";
import { PROVIDER_IDS, PROVIDER_META } from "@/types/usage";
import type { RefreshInterval } from "@/types/settings";
import { REFRESH_INTERVALS } from "@/types/settings";
import { isAutostartSupported } from "@/lib/autostart";
import { SectionHeader } from "@/components/SectionHeader";
import { GlassSurface } from "@/components/GlassSurface";
import { SettingsRow } from "@/components/SettingsRow";
import { Toggle } from "@/components/Toggle";
import { OrbitMark } from "@/components/Icon";
import styles from "./SettingsView.module.css";

function intervalLabel(minutes: RefreshInterval): string {
  return minutes === 60 ? "Every hour" : `Every ${minutes} min`;
}

export function SettingsView() {
  const settings = useUsageStore((s) => s.settings);
  const snapshots = useUsageStore((s) => s.snapshots);
  const setRefreshInterval = useUsageStore((s) => s.setRefreshInterval);
  const setLaunchAtLogin = useUsageStore((s) => s.setLaunchAtLogin);
  const setNotificationsEnabled = useUsageStore((s) => s.setNotificationsEnabled);

  const autostartSupported = isAutostartSupported();

  return (
    <div className={styles.view}>
      <SectionHeader title="Settings" />

      <div className={styles.groups}>
        <GlassSurface variant="card" className={styles.group}>
          <SettingsRow
            title="Refresh interval"
            description="How often Orbit checks remaining usage."
          >
            <select
              className={styles.select}
              aria-label="Refresh interval"
              value={settings.refreshIntervalMinutes}
              onChange={(e) =>
                setRefreshInterval(Number(e.target.value) as RefreshInterval)
              }
            >
              {REFRESH_INTERVALS.map((m) => (
                <option key={m} value={m}>
                  {intervalLabel(m)}
                </option>
              ))}
            </select>
          </SettingsRow>
          <SettingsRow
            title="Launch at login"
            description={
              autostartSupported
                ? "Start Orbit quietly in the menu bar when you sign in."
                : "Available in the desktop app."
            }
          >
            <Toggle
              label="Launch at login"
              checked={settings.launchAtLogin}
              onChange={(v) => void setLaunchAtLogin(v)}
              disabled={!autostartSupported}
            />
          </SettingsRow>
          <SettingsRow
            title="Notifications"
            description={`Notify when a service drops below ${settings.lowUsageThreshold}%.`}
          >
            <Toggle
              label="Notifications"
              checked={settings.notificationsEnabled}
              onChange={setNotificationsEnabled}
            />
          </SettingsRow>
        </GlassSurface>

        <div>
          <h3 className={styles.groupTitle}>Provider status</h3>
          <GlassSurface variant="card" className={styles.group}>
            {PROVIDER_IDS.map((id) => {
              const result = snapshots[id];
              const connected = result?.status === "ok";
              return (
                <SettingsRow
                  key={id}
                  title={PROVIDER_META[id].name}
                  description={
                    connected
                      ? result.snapshot.estimated
                        ? "Connected · estimated from local session logs"
                        : id === "antigravity"
                          ? "Connected · live from the local Antigravity service"
                          : result.snapshot.limitWindow === "weekly"
                            ? "Connected · weekly limit from local session logs"
                            : "Connected · from local session logs"
                        : result?.status === "unavailable"
                          ? result.reason
                          : PROVIDER_META[id].description
                  }
                >
                  <span
                    className={`${styles.statusDot} ${
                      result?.status === "ok" ? styles.statusOk : styles.statusOff
                    }`}
                    role="img"
                    aria-label={result?.status === "ok" ? "Active" : "Unavailable"}
                  />
                </SettingsRow>
              );
            })}
          </GlassSurface>
        </div>

        <div>
          <h3 className={styles.groupTitle}>About</h3>
          <GlassSurface variant="card" className={styles.about}>
            <OrbitMark size={30} />
            <div>
              <div className={styles.aboutName}>Orbit {__APP_VERSION__}</div>
              <div className={styles.aboutCopy}>
                A calm view of your remaining AI usage. Local-first — nothing
                ever leaves your machine.
              </div>
            </div>
          </GlassSurface>
        </div>
      </div>
    </div>
  );
}
