export interface ReaderMouseNavigationActions {
  previous(): void | Promise<void>;
  next(): void | Promise<void>;
  tap?(clientX: number, event: Event): void | Promise<void>;
  tapEnabled?(): boolean;
}

const INTERACTIVE_SELECTOR = "a, button, input, textarea, select, audio, video, [contenteditable], [role='button']";
const SWIPE_DISTANCE = 48;
const SWIPE_DURATION = 600;
const GHOST_CLICK_DELAY = 800;
const TAP_DISTANCE = 12;
const TAP_DURATION = 350;

function eventDocument(event: Event): Document | undefined {
  // EPUB documents belong to another window, so instanceof checks are unreliable.
  const node = event.target as Node | null;
  return node?.nodeType === 9 ? node as Document : node?.ownerDocument ?? undefined;
}

function hasSelection(event: Event) {
  const selection = eventDocument(event)?.getSelection();
  return selection ? !selection.isCollapsed : false;
}

function isInteractive(event: Event) {
  const node = event.target as Node | null;
  const element = node?.nodeType === 1 ? node as Element : node?.parentElement;
  return Boolean(element?.closest(INTERACTIVE_SELECTOR));
}

export function bindReaderMouseNavigation(target: EventTarget, actions: ReaderMouseNavigationActions) {
  let busy = false;
  let suppressMouseUntil = 0;
  let touchActive = false;
  let touch: { identifier: number; x: number; y: number; startedAt: number; moved: boolean } | undefined;

  const run = (action: () => void | Promise<void>) => {
    if (busy) return;
    const operation = action();
    if (operation) {
      busy = true;
      // DOM events have no caller to receive a rejected navigation promise.
      void operation.then(() => { busy = false; }, () => { busy = false; });
    }
  };
  const navigate = (direction: "previous" | "next") => run(() => actions[direction]());
  const tapEnabled = () => Boolean(actions.tap && (actions.tapEnabled?.() ?? true));
  const tap = (clientX: number, event: Event) => run(() => actions.tap?.(clientX, event));

  const ignoreMouse = (event: Event) => {
    const capabilities = (event as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities;
    return event.defaultPrevented || touchActive || Date.now() < suppressMouseUntil
      || capabilities?.firesTouchEvents === true || isInteractive(event) || hasSelection(event);
  };

  const onClick = (event: Event) => {
    if (ignoreMouse(event) || (event as MouseEvent).button !== 0) return;
    if (tapEnabled()) tap((event as MouseEvent).clientX, event);
    else navigate("next");
  };
  const onContextMenu = (event: Event) => {
    if (ignoreMouse(event)) return;
    event.preventDefault();
    navigate("previous");
  };
  const onWheel = (event: Event) => {
    if (ignoreMouse(event) || (event as WheelEvent).ctrlKey) return;
    const deltaY = (event as WheelEvent).deltaY;
    if (!deltaY) return;
    event.preventDefault();
    navigate(deltaY > 0 ? "next" : "previous");
  };

  const onTouchStart = (event: Event) => {
    touchActive = true;
    suppressMouseUntil = Date.now() + GHOST_CLICK_DELAY;
    const touches = (event as TouchEvent).touches;
    touch = touches.length === 1 && !event.defaultPrevented && !isInteractive(event) && !hasSelection(event)
      ? { identifier: touches[0].identifier, x: touches[0].clientX, y: touches[0].clientY, startedAt: Date.now(), moved: false }
      : undefined;
  };
  const onTouchMove = (event: Event) => {
    if (!touch) return;
    const touches = (event as TouchEvent).touches;
    const point = Array.from(touches).find((item) => item.identifier === touch?.identifier);
    if (touches.length !== 1 || !point || hasSelection(event) || Date.now() - touch.startedAt > SWIPE_DURATION) {
      touch = undefined;
      return;
    }
    const dx = Math.abs(point.clientX - touch.x);
    const dy = Math.abs(point.clientY - touch.y);
    if (dx > TAP_DISTANCE || dy > TAP_DISTANCE) touch.moved = true;
    // Once the gesture becomes a vertical scroll, it cannot turn into a page swipe.
    if (dy > 16 && dy >= dx) {
      touch = undefined;
    } else if (dx > 16 && dx > dy * 1.5 && event.cancelable) {
      event.preventDefault();
    }
  };
  const onTouchEnd = (event: Event) => {
    suppressMouseUntil = Date.now() + GHOST_CLICK_DELAY;
    const gesture = touch;
    touch = undefined;
    const ended = event as TouchEvent;
    touchActive = ended.touches.length > 0;
    if (!gesture || ended.touches.length || event.defaultPrevented || hasSelection(event)
      || Date.now() - gesture.startedAt > SWIPE_DURATION) return;
    const point = Array.from(ended.changedTouches).find((item) => item.identifier === gesture.identifier);
    if (!point) return;
    const dx = point.clientX - gesture.x;
    const dy = point.clientY - gesture.y;
    if (tapEnabled() && !gesture.moved && Math.abs(dx) <= TAP_DISTANCE && Math.abs(dy) <= TAP_DISTANCE
      && Date.now() - gesture.startedAt <= TAP_DURATION && !isInteractive(event)) {
      if (event.cancelable) event.preventDefault();
      tap(point.clientX, event);
      return;
    }
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
    if (event.cancelable) event.preventDefault();
    navigate(dx < 0 ? "next" : "previous");
  };
  const onTouchCancel = () => {
    touchActive = false;
    touch = undefined;
    suppressMouseUntil = Date.now() + GHOST_CLICK_DELAY;
  };

  target.addEventListener("click", onClick);
  target.addEventListener("contextmenu", onContextMenu);
  target.addEventListener("wheel", onWheel, { passive: false });
  target.addEventListener("touchstart", onTouchStart, { passive: true });
  target.addEventListener("touchmove", onTouchMove, { passive: false });
  target.addEventListener("touchend", onTouchEnd, { passive: false });
  target.addEventListener("touchcancel", onTouchCancel, { passive: true });

  return () => {
    touchActive = false;
    touch = undefined;
    target.removeEventListener("click", onClick);
    target.removeEventListener("contextmenu", onContextMenu);
    target.removeEventListener("wheel", onWheel);
    target.removeEventListener("touchstart", onTouchStart);
    target.removeEventListener("touchmove", onTouchMove);
    target.removeEventListener("touchend", onTouchEnd);
    target.removeEventListener("touchcancel", onTouchCancel);
  };
}
