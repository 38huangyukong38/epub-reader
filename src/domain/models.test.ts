import { DEFAULT_APPEARANCE } from "./models";

it("uses a readable default overlay", () => {
  expect(DEFAULT_APPEARANCE).toEqual({
    backgroundEnabled: false,
    overlayOpacity: 0.55,
  });
});
