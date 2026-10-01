export const WHEEL_LINE_PX = 16;
const ARROW_SCROLL_PX = 40;
const PAGE_SCROLL_FACTOR = 0.85;
const WHEEL_LISTEN_OPTIONS = { capture: true, passive: false };

export function attachSmoothScroll(element) {
  if (!element) return () => {};

  const maxScroll = () =>
    Math.max(0, (Number(element.scrollHeight) || 0) - (Number(element.clientHeight) || 0));

  const scrollBy = (delta) => {
    if (!delta || maxScroll() <= 0) return false;
    const current = Number(element.scrollTop) || 0;
    element.scrollTop = Math.min(maxScroll(), Math.max(0, current + delta));
    return true;
  };

  const onWheel = (event) => {
    if (event.ctrlKey || event.defaultPrevented) return;
    if (!scrollBy(wheelDeltaY(event, element))) return;
    if (event.cancelable !== false) event.preventDefault();
  };

  const onKeyDown = (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    if (!scrollBy(keyDeltaY(event, element))) return;
    event.preventDefault();
  };

  element.addEventListener("wheel", onWheel, WHEEL_LISTEN_OPTIONS);
  element.addEventListener("keydown", onKeyDown);

  return () => {
    element.removeEventListener("wheel", onWheel, WHEEL_LISTEN_OPTIONS);
    element.removeEventListener("keydown", onKeyDown);
  };
}

function wheelDeltaY(event, element) {
  const deltaY = Number(event.deltaY) || 0;
  if (!deltaY) return 0;
  const line = lineHeight(element);
  if (event.deltaMode === 1) return Math.sign(deltaY) * line;
  if (event.deltaMode === 2) {
    return Math.sign(deltaY) * Math.max(line, (Number(element.clientHeight) || 0) * 0.5);
  }
  if (Math.abs(deltaY) >= line * 2) return Math.sign(deltaY) * line;
  return deltaY;
}

function keyDeltaY(event, element) {
  const page = (Number(element.clientHeight) || 0) * PAGE_SCROLL_FACTOR;
  switch (event.key) {
    case "ArrowDown":
      return ARROW_SCROLL_PX;
    case "ArrowUp":
      return -ARROW_SCROLL_PX;
    case "PageDown":
      return page || ARROW_SCROLL_PX;
    case "PageUp":
      return -(page || ARROW_SCROLL_PX);
    default:
      return 0;
  }
}

function lineHeight(element) {
  const view = element.ownerDocument?.defaultView;
  const style = view?.getComputedStyle?.(element);
  const rawHeight = style?.lineHeight;
  const height = Number.parseFloat(rawHeight);
  if (Number.isFinite(height) && /px$/i.test(String(rawHeight)) && height > 0) {
    return height;
  }
  const fontSize = Number.parseFloat(style?.fontSize);
  if (Number.isFinite(fontSize) && fontSize > 0) {
    if (Number.isFinite(height) && height >= 1 && height <= 4) return fontSize * height;
    return fontSize * 1.65;
  }
  return WHEEL_LINE_PX;
}
