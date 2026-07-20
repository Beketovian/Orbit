import styles from "./Toggle.module.css";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Accessible name; required because the control has no visible text. */
  label: string;
}

/** A macOS-style switch. */
export function Toggle({ checked, onChange, disabled, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`${styles.toggle} ${checked ? styles.on : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} aria-hidden />
    </button>
  );
}
