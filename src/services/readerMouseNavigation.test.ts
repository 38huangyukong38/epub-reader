import { vi } from "vitest";
import { bindReaderMouseNavigation } from "./readerMouseNavigation";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.getSelection()?.removeAllRanges();
  document.body.replaceChildren();
});

it("maps reader mouse input to pagination and releases listeners", () => {
  const target = document.createElement("div");
  const previous = vi.fn();
  const next = vi.fn();
  const cleanup = bindReaderMouseNavigation(target, { previous, next });

  fireEvent(target, new MouseEvent("click", { bubbles: true, button: 0 }));
  const previousPage = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
  fireEvent(target, previousPage);
  const nextPage = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 10 });
  fireEvent(target, nextPage);
  const priorPage = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -10 });
  fireEvent(target, priorPage);

  expect(next).toHaveBeenCalledTimes(2);
  expect(previous).toHaveBeenCalledTimes(2);
  expect(previousPage.defaultPrevented).toBe(true);
  expect(nextPage.defaultPrevented).toBe(true);
  expect(priorPage.defaultPrevented).toBe(true);

  cleanup();
  fireEvent(target, new MouseEvent("click", { bubbles: true, button: 0 }));
  expect(next).toHaveBeenCalledTimes(2);
});

function fireEvent(target: EventTarget, event: Event) {
  target.dispatchEvent(event);
}

function touchEvent(target: EventTarget, type: string, points: Array<[number, number]>, changed = points) {
  const asTouches = (values: Array<[number, number]>) => values.map(([clientX, clientY], identifier) => ({ identifier, clientX, clientY }));
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: { value: asTouches(points) },
    changedTouches: { value: asTouches(changed) },
  });
  target.dispatchEvent(event);
  return event;
}

function swipe(target: EventTarget, start: [number, number], end: [number, number]) {
  touchEvent(target, "touchstart", [start]);
  return touchEvent(target, "touchend", [], [end]);
}

it("turns a single page for horizontal swipes and ignores their synthetic mouse events", () => {
  const target = document.createElement("div");
  const previous = vi.fn();
  const next = vi.fn();
  const cleanup = bindReaderMouseNavigation(target, { previous, next });

  expect(swipe(target, [250, 100], [80, 108]).defaultPrevented).toBe(true);
  fireEvent(target, new MouseEvent("click", { bubbles: true }));
  fireEvent(target, new MouseEvent("contextmenu", { bubbles: true }));
  swipe(target, [60, 100], [260, 110]);

  expect(next).toHaveBeenCalledOnce();
  expect(previous).toHaveBeenCalledOnce();
  cleanup();
  swipe(target, [250, 100], [80, 108]);
  expect(next).toHaveBeenCalledOnce();
});

it("leaves taps, short drags, diagonal drags, vertical scrolls, and long presses alone", () => {
  vi.useFakeTimers();
  const target = document.createElement("div");
  const previous = vi.fn();
  const next = vi.fn();
  const cleanup = bindReaderMouseNavigation(target, { previous, next });

  swipe(target, [100, 100], [100, 100]);
  fireEvent(target, new MouseEvent("click", { bubbles: true }));
  swipe(target, [100, 100], [70, 100]);
  swipe(target, [100, 100], [30, 30]);
  swipe(target, [100, 100], [95, 300]);
  touchEvent(target, "touchstart", [[300, 100]]);
  const scroll = touchEvent(target, "touchmove", [[290, 170]]);
  touchEvent(target, "touchend", [], [[50, 110]]);
  expect(scroll.defaultPrevented).toBe(false);

  touchEvent(target, "touchstart", [[300, 100]]);
  vi.advanceTimersByTime(900);
  touchEvent(target, "touchmove", [[295, 100]]);
  const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  fireEvent(target, menu);
  touchEvent(target, "touchend", [], [[50, 100]]);
  expect(menu.defaultPrevented).toBe(false);
  expect(next).not.toHaveBeenCalled();
  expect(previous).not.toHaveBeenCalled();
  cleanup();
});

it("cancels swipes on pinch gestures and touch cancellation", () => {
  const target = document.createElement("div");
  const previous = vi.fn();
  const next = vi.fn();
  const cleanup = bindReaderMouseNavigation(target, { previous, next });

  touchEvent(target, "touchstart", [[300, 100], [280, 150]]);
  touchEvent(target, "touchend", [], [[50, 100]]);
  touchEvent(target, "touchstart", [[300, 100]]);
  touchEvent(target, "touchmove", [[200, 100], [280, 150]]);
  touchEvent(target, "touchend", [], [[50, 100]]);
  touchEvent(target, "touchstart", [[300, 100]]);
  touchEvent(target, "touchcancel", []);
  touchEvent(target, "touchend", [], [[50, 100]]);

  expect(next).not.toHaveBeenCalled();
  expect(previous).not.toHaveBeenCalled();
  cleanup();
});

it("does not intercept EPUB links, form controls, or selected text", () => {
  const target = document.createElement("div");
  target.innerHTML = '<a href="#note"><span>Note</span></a><input /><p>Selectable passage</p>';
  document.body.append(target);
  const previous = vi.fn();
  const next = vi.fn();
  const cleanup = bindReaderMouseNavigation(target, { previous, next });
  const link = target.querySelector("span")!;

  fireEvent(link, new MouseEvent("click", { bubbles: true }));
  fireEvent(target.querySelector("input")!, new MouseEvent("click", { bubbles: true }));
  swipe(link, [300, 100], [50, 100]);
  const range = document.createRange();
  range.selectNodeContents(target.querySelector("p")!);
  document.getSelection()?.addRange(range);
  swipe(target, [300, 100], [50, 100]);

  expect(next).not.toHaveBeenCalled();
  expect(previous).not.toHaveBeenCalled();
  cleanup();
});

it("prevents horizontal browser scrolling only once a swipe is clearly horizontal", () => {
  const target = document.createElement("div");
  const next = vi.fn();
  const cleanup = bindReaderMouseNavigation(target, { previous: vi.fn(), next });
  touchEvent(target, "touchstart", [[300, 100]]);
  expect(touchEvent(target, "touchmove", [[295, 100]]).defaultPrevented).toBe(false);
  expect(touchEvent(target, "touchmove", [[200, 105]]).defaultPrevented).toBe(true);
  touchEvent(target, "touchend", [], [[50, 110]]);
  expect(next).toHaveBeenCalledOnce();
  cleanup();
});

it("ignores repeated input during an asynchronous page turn and recovers after failure", async () => {
  const target = document.createElement("div");
  let reject: (reason: Error) => void = () => undefined;
  const next = vi.fn().mockReturnValueOnce(new Promise<void>((_resolve, rejectPage) => { reject = rejectPage; }));
  const cleanup = bindReaderMouseNavigation(target, { previous: vi.fn(), next });

  swipe(target, [300, 100], [50, 100]);
  swipe(target, [300, 100], [50, 100]);
  expect(next).toHaveBeenCalledOnce();
  reject(new Error("navigation failed"));
  await Promise.resolve();
  swipe(target, [300, 100], [50, 100]);
  expect(next).toHaveBeenCalledTimes(2);
  cleanup();
});

it("handles a touch tap once while rejecting long presses and out-and-back drags", () => {
  vi.useFakeTimers();
  const target = document.createElement("div");
  const tap = vi.fn();
  const next = vi.fn();
  const cleanup = bindReaderMouseNavigation(target, { previous: vi.fn(), next, tap });
  expect(swipe(target, [190, 100], [192, 103]).defaultPrevented).toBe(true);
  expect(tap).toHaveBeenCalledOnce();
  fireEvent(target, new MouseEvent("click", { bubbles: true, clientX: 192 }));
  expect(tap).toHaveBeenCalledOnce();
  touchEvent(target, "touchstart", [[190, 100]]);
  vi.advanceTimersByTime(450);
  touchEvent(target, "touchend", [], [[190, 100]]);
  touchEvent(target, "touchstart", [[190, 100]]);
  touchEvent(target, "touchmove", [[215, 100]]);
  touchEvent(target, "touchend", [], [[190, 100]]);
  expect(tap).toHaveBeenCalledOnce();
  swipe(target, [300, 100], [80, 100]);
  expect(next).toHaveBeenCalledOnce();
  cleanup();
});

it("leaves links and selected text available when tap regions are enabled", () => {
  const target = document.createElement("div");
  target.innerHTML = '<a href="#note">脚注</a><p>选择这段文字</p>';
  document.body.append(target);
  const tap = vi.fn();
  const cleanup = bindReaderMouseNavigation(target, { previous: vi.fn(), next: vi.fn(), tap });
  const linkTap = swipe(target.querySelector("a")!, [190, 100], [190, 100]);
  expect(linkTap.defaultPrevented).toBe(false);
  const range = document.createRange();
  range.selectNodeContents(target.querySelector("p")!);
  document.getSelection()?.addRange(range);
  swipe(target, [190, 100], [190, 100]);
  expect(tap).not.toHaveBeenCalled();
  cleanup();
});
