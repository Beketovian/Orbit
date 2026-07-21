import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "@/types/settings";
import { useUsageStore } from "@/store/usageStore";
import { PanelApp } from "./PanelApp";

vi.mock("@/hooks/useAutoRefresh", () => ({ useAutoRefresh: () => undefined }));
vi.mock("@/hooks/useNow", () => ({ useNow: () => 0 }));

function setPanelState(showUsageHints: boolean) {
  useUsageStore.setState({
    settings: { ...DEFAULT_SETTINGS, showUsageHints },
    snapshots: {
      claude: null,
      codex: {
        status: "ok",
        snapshot: {
          providerId: "codex",
          percentRemaining: 29,
          reset: { kind: "unknown" },
          takenAt: 0,
        },
      },
      antigravity: null,
    },
    lastUpdated: 0,
    refreshing: false,
  });
}

describe("PanelApp", () => {
  beforeEach(() => setPanelState(true));

  it("shows usage guidance when the preference is enabled", () => {
    render(<PanelApp />);
    expect(screen.getByText("Keep an eye on Codex.")).toBeInTheDocument();
  });

  it("removes usage guidance when the preference is disabled", () => {
    setPanelState(false);
    render(<PanelApp />);
    expect(screen.queryByText("Keep an eye on Codex.")).not.toBeInTheDocument();
  });
});
