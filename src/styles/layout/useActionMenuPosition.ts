import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

interface ActionMenuPosition {
  left: number;
  top: number;
}

interface ActionMenuAnchorBounds {
  bottom: number;
  right: number;
  top: number;
}

interface ActionMenuPanelSize {
  height: number;
  width: number;
}

export function calculateActionMenuPosition(
  anchor: ActionMenuAnchorBounds,
  panel: ActionMenuPanelSize,
  viewportWidth: number,
  viewportHeight: number,
): ActionMenuPosition {
  const viewportPadding = 8;
  const menuGap = 6;
  const availableBelow = viewportHeight - anchor.bottom;
  const openAbove =
    availableBelow < panel.height + menuGap + viewportPadding &&
    anchor.top > availableBelow;
  const unclampedTop = openAbove
    ? anchor.top - panel.height - menuGap
    : anchor.bottom + menuGap;
  const maxLeft = Math.max(
    viewportPadding,
    viewportWidth - panel.width - viewportPadding,
  );
  const maxTop = Math.max(
    viewportPadding,
    viewportHeight - panel.height - viewportPadding,
  );

  return {
    left: Math.min(
      Math.max(viewportPadding, anchor.right - panel.width),
      maxLeft,
    ),
    top: Math.min(
      Math.max(viewportPadding, unclampedTop),
      maxTop,
    ),
  };
}

export function useActionMenuPosition(
  buttonRef: RefObject<HTMLButtonElement | null>,
  panelRef: RefObject<HTMLDivElement | null>,
  isOpen: boolean,
): CSSProperties {
  const [position, setPosition] = useState<ActionMenuPosition | null>(null);

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;
    const panel = panelRef.current;

    if (!button || !panel) {
      return;
    }

    const buttonRect = button.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    setPosition(
      calculateActionMenuPosition(
        buttonRect,
        panelRect,
        window.innerWidth,
        window.innerHeight,
      ),
    );
  }, [buttonRef, panelRef]);

  useLayoutEffect(() => {
    if (isOpen) {
      setPosition(null);
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let updateFrame: number | null = null;

    function handleViewportChange() {
      if (updateFrame !== null) {
        window.cancelAnimationFrame(updateFrame);
      }

      updateFrame = window.requestAnimationFrame(() => {
        updateFrame = null;
        updatePosition();
      });
    }

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      if (updateFrame !== null) {
        window.cancelAnimationFrame(updateFrame);
      }

      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, updatePosition]);

  return position ?? { left: 0, top: 0, visibility: "hidden" };
}
