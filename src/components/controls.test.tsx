import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toggle } from "./Toggle";
import { SegmentedControl } from "./SegmentedControl";

describe("Toggle", () => {
  it("is an accessible switch that reports state changes", async () => {
    const onChange = vi.fn();
    render(<Toggle label="Notifications" checked={false} onChange={onChange} />);
    const control = screen.getByRole("switch", { name: "Notifications" });
    expect(control).toHaveAttribute("aria-checked", "false");
    await userEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("SegmentedControl", () => {
  it("renders radio semantics and switches selection", async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="History range"
        value="7"
        onChange={onChange}
        options={[
          { value: "7", label: "7 days" },
          { value: "30", label: "30 days" },
        ]}
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "History range" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "7 days" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await userEvent.click(screen.getByRole("radio", { name: "30 days" }));
    expect(onChange).toHaveBeenCalledWith("30");
  });
});
