import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

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

interface ActionMenuProps {
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
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

function ActionMenu({
  ariaLabel,
  children,
  disabled = false,
  isOpen,
  onOpenChange,
}: ActionMenuProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
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
  }, []);

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

    function handleDocumentMouseDown(event: MouseEvent) {
      const target = event.target;

      if (
        target instanceof Node &&
        !buttonRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        onOpenChange(false);
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleDocumentMouseDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      if (updateFrame !== null) {
        window.cancelAnimationFrame(updateFrame);
      }

      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isOpen, onOpenChange, updatePosition]);

  return (
    <div className="project-action-menu" data-project-action-menu>
      <button
        ref={buttonRef}
        className="more-actions-button"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => onOpenChange(!isOpen)}
      >
        ⋯
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            className="project-action-menu-panel"
            data-project-action-menu
            role="menu"
            style={
              position
                ? position
                : {
                    left: 0,
                    top: 0,
                    visibility: "hidden",
                  }
            }
            onClick={(event) => {
              const target = event.target;

              if (
                target instanceof Element &&
                target.closest('button[role="menuitem"]:not(:disabled)')
              ) {
                onOpenChange(false);
              }
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}

export default ActionMenu;
