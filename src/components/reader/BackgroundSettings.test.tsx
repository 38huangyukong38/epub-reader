import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { BackgroundSettings } from "./BackgroundSettings";

it("disables the background without removing its image", () => {
  const onEnabledChange = vi.fn();
  const onReset = vi.fn();
  render(<BackgroundSettings hasImage={true} enabled={true} onFile={vi.fn()} onEnabledChange={onEnabledChange} onReset={onReset} />);
  fireEvent.click(screen.getByLabelText("启用背景"));
  expect(onEnabledChange).toHaveBeenCalledWith(false);
  expect(onReset).not.toHaveBeenCalled();
});
