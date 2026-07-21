import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProviderCard } from "./ProviderCard";

const NOW = new Date(2026, 6, 20, 12, 0).getTime();

describe("ProviderCard", () => {
  it("labels the ring as weekly when no five-hour limit is available", () => {
    render(
      <ProviderCard
        provider="codex"
        now={NOW}
        result={{
          status: "ok",
          snapshot: {
            providerId: "codex",
            percentRemaining: 47,
            reset: { kind: "at", timestamp: NOW + 5 * 24 * 3_600_000 },
            takenAt: NOW,
            limitWindow: "weekly",
          },
        }}
      />,
    );

    expect(screen.getByText("Week remaining")).toBeInTheDocument();
    expect(screen.getByText("Week")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "47");
  });

  it("shows both Codex windows while keeping five-hour usage primary", () => {
    render(
      <ProviderCard
        provider="codex"
        now={NOW}
        result={{
          status: "ok",
          snapshot: {
            providerId: "codex",
            percentRemaining: 80,
            reset: { kind: "at", timestamp: NOW + 2 * 3_600_000 },
            takenAt: NOW,
            limitWindow: "fiveHour",
            limits: [
              {
                window: "fiveHour",
                percentRemaining: 80,
                reset: { kind: "at", timestamp: NOW + 2 * 3_600_000 },
              },
              {
                window: "weekly",
                percentRemaining: 62,
                reset: { kind: "at", timestamp: NOW + 5 * 24 * 3_600_000 },
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText("5h remaining")).toBeInTheDocument();
    expect(screen.getByText("Resets in 2h")).toBeInTheDocument();
    expect(screen.getByLabelText("Codex limit details")).toHaveTextContent(
      "5h80%Week62%",
    );
  });

  it("switches Antigravity model groups and shows colored usage dots", async () => {
    const user = userEvent.setup();
    render(
      <ProviderCard
        provider="antigravity"
        now={NOW}
        result={{
          status: "ok",
          snapshot: {
            providerId: "antigravity",
            percentRemaining: 86,
            reset: { kind: "at", timestamp: NOW + 6 * 24 * 3_600_000 },
            takenAt: NOW,
            limitWindow: "weekly",
            usageCategories: [
              {
                id: "gemini",
                name: "Gemini Models",
                limits: [
                  {
                    window: "fiveHour",
                    percentRemaining: 100,
                    reset: { kind: "at", timestamp: NOW + 5 * 3_600_000 },
                  },
                  {
                    window: "weekly",
                    percentRemaining: 100,
                    reset: { kind: "at", timestamp: NOW + 6 * 24 * 3_600_000 },
                  },
                ],
              },
              {
                id: "3p",
                name: "Claude and GPT models",
                limits: [
                  {
                    window: "fiveHour",
                    percentRemaining: 100,
                    reset: { kind: "at", timestamp: NOW + 5 * 3_600_000 },
                  },
                  {
                    window: "weekly",
                    percentRemaining: 86,
                    reset: { kind: "at", timestamp: NOW + 6 * 24 * 3_600_000 },
                  },
                ],
              },
            ],
          },
        }}
      />,
    );

    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByText("5h remaining")).toBeInTheDocument();
    const trigger = screen.getByRole("button", {
      name: "Antigravity model usage category: Claude and GPT models",
    });
    expect(screen.getByLabelText("Claude and GPT models limit details")).toHaveTextContent(
      "5h100%Week86%",
    );

    await user.click(trigger);
    const listbox = screen.getByRole("listbox", { name: "Model usage categories" });
    expect(within(listbox).getAllByTitle(/% remaining/)).toHaveLength(2);
    await user.click(
      within(listbox).getByRole("option", {
        name: "Gemini Models, 100% remaining",
      }),
    );

    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByRole("button", {
      name: "Antigravity model usage category: Gemini Models",
    })).toHaveTextContent("Gemini Models");
    expect(screen.getByLabelText("Gemini Models limit details")).toHaveTextContent(
      "5h100%Week100%",
    );
  });
});
