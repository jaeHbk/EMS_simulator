import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EsiSelector } from "./EsiSelector";

describe("EsiSelector", () => {
  it("renders all five ESI levels with descriptors", () => {
    render(<EsiSelector value={null} onSelect={() => {}} />);
    for (let level = 1; level <= 5; level += 1) {
      expect(screen.getByText(`ESI ${level}`)).toBeInTheDocument();
    }
    expect(
      screen.getByText(/immediate life-saving intervention/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/needs no resources/i)).toBeInTheDocument();
  });

  it("calls back with the chosen level", () => {
    const onSelect = vi.fn();
    render(<EsiSelector value={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("ESI 3"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("marks the selected level as checked", () => {
    render(<EsiSelector value={2} onSelect={() => {}} />);
    const checked = screen
      .getAllByRole("radio")
      .filter((el) => el.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0]?.getAttribute("data-level")).toBe("2");
  });

  it("does not call back when disabled", () => {
    const onSelect = vi.fn();
    render(<EsiSelector value={null} onSelect={onSelect} disabled />);
    fireEvent.click(screen.getByText("ESI 1"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
