import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useActionMenuPosition } from "../styles/layout/useActionMenuPosition";

interface ActionMenuProps {
  ariaLabel: string;
  children: ReactNode;
  disabled?: boolean;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
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
  const positionStyle = useActionMenuPosition(buttonRef, panelRef, isOpen);

  useEffect(() => {
    if (!isOpen) {
      return;
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

    return () => {
      document.removeEventListener("mousedown", handleDocumentMouseDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [isOpen, onOpenChange]);

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
            style={positionStyle}
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
