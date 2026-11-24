import type { ComponentPropsWithRef, MouseEvent } from "react";

interface ClickableTableRowProps
  extends Omit<ComponentPropsWithRef<"tr">, "onClick"> {
  onOpen: () => void;
}

// Portaled action menus bubble through the React tree, so their panel is
// excluded alongside the controls rendered inside the row itself.
const independentControlSelector =
  "button, a, input, select, textarea, label, [data-project-action-menu]";

/* The whole row opens on click. Each row must also contain a button that calls
   the same action, which provides keyboard and assistive technology access. */
function ClickableTableRow({
  className,
  onOpen,
  ...rowProps
}: ClickableTableRowProps) {
  function handleClick(event: MouseEvent<HTMLTableRowElement>) {
    if (
      event.defaultPrevented ||
      !(event.target instanceof Element) ||
      event.target.closest(independentControlSelector)
    ) {
      return;
    }

    onOpen();
  }

  return (
    <tr
      {...rowProps}
      className={["clickable-table-row", className].filter(Boolean).join(" ")}
      onClick={handleClick}
    />
  );
}

export default ClickableTableRow;
