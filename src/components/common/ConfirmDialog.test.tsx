import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

it("confirms or cancels a requested action", () => {
  const onCancel = vi.fn();
  const onConfirm = vi.fn();
  render(<ConfirmDialog title="跳转到第一章？" message="将离开当前阅读位置。" onCancel={onCancel} onConfirm={onConfirm} />);

  expect(screen.getByRole("dialog", { name: "跳转到第一章？" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(onCancel).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "跳转" }));
  expect(onConfirm).toHaveBeenCalledOnce();
});
