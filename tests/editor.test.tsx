// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RangeControls } from "../src/web/editor/RangeControls";
import { toFrame } from "../src/shared/edit";

describe("Editor Range Controls and Calculations", () => {
  it("converts 80s to 110s range and 98.4s moment into exact canonical frames", () => {
    const startSec = 80;
    const endSec = 110;
    const momentSec = 98.4;

    const startFrame = toFrame(startSec);
    const endFrame = toFrame(endSec);
    const momentFrame = toFrame(momentSec);

    expect(startFrame).toBe(2400);
    expect(endFrame).toBe(3300);
    expect(momentFrame).toBe(2952);
  });

  it("renders RangeControls and invokes onChangeRange when inputs change", () => {
    const handleChange = vi.fn();
    render(
      <RangeControls
        durationFrames={7560}
        startFrame={2400}
        endFrame={3300}
        momentFrame={2952}
        onChangeRange={handleChange}
      />,
    );

    expect(screen.getByText(/Rentang Momen Terpilih/i)).toBeInTheDocument();
    expect(screen.getByText(/30.0 detik/i)).toBeInTheDocument();

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs.length).toBe(3);

    // Change start frame input
    fireEvent.change(inputs[0], { target: { value: "2500" } });
    expect(handleChange).toHaveBeenCalledWith(2500, 3300, 2952);
  });

  it("warns when moment frame is outside the selected range", () => {
    render(
      <RangeControls
        durationFrames={7560}
        startFrame={2400}
        endFrame={3300}
        momentFrame={3400} // outside range
        onChangeRange={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Titik lucu harus berada di antara awal dan akhir/i),
    ).toBeInTheDocument();
  });
});
