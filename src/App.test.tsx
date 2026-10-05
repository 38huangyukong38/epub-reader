import { render, screen } from "@testing-library/react";
import App from "./App";

it("renders the local library heading", () => {
  render(<App />);

  expect(screen.getByRole("heading", { name: "本地书架" })).toBeInTheDocument();
});
