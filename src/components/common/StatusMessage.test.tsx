import { render, screen } from "@testing-library/react";
import { StatusMessage } from "./StatusMessage";

it("shows an accessible error message", () => {
  render(<StatusMessage tone="error">无法解析该 EPUB 文件</StatusMessage>);
  expect(screen.getByRole("alert")).toHaveTextContent("无法解析该 EPUB 文件");
});
