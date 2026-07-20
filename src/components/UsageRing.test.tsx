import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UsageRing } from "./UsageRing";

describe("UsageRing", () => {
  it("exposes a meter with the current value", () => {
    render(<UsageRing provider="claude" label="Claude" value={92} />);
    const meter = screen.getByRole("meter", { name: "Claude usage remaining" });
    expect(meter).toHaveAttribute("aria-valuenow", "92");
    expect(meter).toHaveAttribute("aria-valuemin", "0");
    expect(meter).toHaveAttribute("aria-valuemax", "100");
    expect(meter).toHaveAttribute("aria-valuetext", "92% remaining");
  });

  it("clamps out-of-range values", () => {
    render(<UsageRing provider="codex" label="Codex" value={140} />);
    const meter = screen.getByRole("meter", { name: "Codex usage remaining" });
    expect(meter).toHaveAttribute("aria-valuenow", "100");
  });

  it("announces unavailable state honestly", () => {
    render(<UsageRing provider="antigravity" label="Antigravity" value={null} />);
    const meter = screen.getByRole("meter", {
      name: "Antigravity usage remaining",
    });
    expect(meter).not.toHaveAttribute("aria-valuenow");
    expect(meter).toHaveAttribute("aria-valuetext", "Unavailable");
  });

  it("renders the percentage and label", () => {
    render(<UsageRing provider="claude" label="Claude" value={92} />);
    const meter = screen.getByRole("meter", { name: "Claude usage remaining" });
    expect(meter).toHaveTextContent("92%");
    expect(meter).toHaveTextContent("Claude");
  });
});
