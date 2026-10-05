import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { TableOfContents } from "./TableOfContents";

it("marks the current chapter and navigates when selected", () => {
  const onSelect = vi.fn();
  render(<TableOfContents activeHref="chapter-2.xhtml" items={[
    { label: "第一章", href: "chapter-1.xhtml", subitems: [] },
    { label: "第二章", href: "chapter-2.xhtml", subitems: [] },
  ]} onSelect={onSelect} />);

  expect(screen.getByRole("button", { name: "第二章" })).toHaveAttribute("aria-current", "true");
  fireEvent.click(screen.getByRole("button", { name: "第一章" }));
  expect(onSelect).toHaveBeenCalledWith("chapter-1.xhtml");
});

it("folds nested chapters independently of jumping and reveals a newly active chapter", () => {
  const onSelect = vi.fn();
  const items = [{ label: "卷一", href: "volume.xhtml", subitems: [
    { label: "第一章", href: "chapter-1.xhtml", subitems: [] },
    { label: "第二章", href: "chapter-2.xhtml", subitems: [] },
  ] }];
  const { rerender } = render(<TableOfContents items={items} activeHref="chapter-1.xhtml" onSelect={onSelect} />);
  fireEvent.click(screen.getByRole("button", { name: "收起卷一" }));
  expect(screen.queryByRole("button", { name: "第一章" })).not.toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "展开卷一" })).toHaveAttribute("aria-expanded", "false");

  rerender(<TableOfContents items={items} activeHref="chapter-2.xhtml" onSelect={onSelect} />);
  expect(screen.getByRole("button", { name: "第二章" })).toHaveAttribute("aria-current", "true");
  expect(screen.getByRole("button", { name: "收起卷一" })).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(screen.getByRole("button", { name: "卷一" }));
  expect(onSelect).toHaveBeenCalledWith("volume.xhtml");
});
