import { useEffect } from "react";
import {
  isAuditNavigationItem,
  type ProjectNavigationItem,
} from "../types/navigation";

export type AttentionDestinationPage =
  | "Assets"
  | "Checklists & Tests"
  | "Issues"
  | "Documents"
  | "Reports";

export interface AttentionNavigationRequest {
  requestId: number;
  page: AttentionDestinationPage;
  item: ProjectNavigationItem;
}

interface AttentionFocusManagerProps {
  activePage: string;
  target: AttentionNavigationRequest | null;
  onComplete: (requestId: number) => void;
}

function normalizeText(value: string): string {
  return value
    .replace(/[\u2014\u2013]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getReactKey(element: Element): string | null {
  const propertyName = Object.getOwnPropertyNames(element).find(
    (key) =>
      key.startsWith("__reactFiber$") ||
      key.startsWith("__reactInternalInstance$"),
  );

  if (!propertyName) {
    return null;
  }

  let fiber = (element as unknown as Record<string, unknown>)[
    propertyName
  ] as
    | {
        key?: string | number | null;
        return?: unknown;
      }
    | undefined;

  for (let depth = 0; fiber && depth < 8; depth += 1) {
    if (fiber.key !== null && fiber.key !== undefined) {
      return String(fiber.key);
    }

    fiber = fiber.return as typeof fiber;
  }

  return null;
}

function findRow(
  selector: string,
  id: string,
  fallbackText: string,
): HTMLTableRowElement | null {
  const rows = Array.from(
    document.querySelectorAll<HTMLTableRowElement>(selector),
  );

  const exactRow = rows.find(
    (row) =>
      row.dataset.navigationId === id || getReactKey(row) === id,
  );

  if (exactRow) {
    return exactRow;
  }

  const normalizedFallback = normalizeText(fallbackText);

  if (!normalizedFallback) {
    return null;
  }

  return (
    rows.find((row) =>
      normalizeText(row.textContent ?? "").includes(
        normalizedFallback,
      ),
    ) ?? null
  );
}

function AttentionFocusManager({
  activePage,
  target,
  onComplete,
}: AttentionFocusManagerProps) {
  useEffect(() => {
    if (!target || activePage !== target.page) {
      return;
    }

    const request = target;
    let completed = false;
    let openedParentRecord = false;
    let animationTimer: number | null = null;
    let scrollFrame: number | null = null;

    function startFlash(row: HTMLTableRowElement) {
      if (!row.isConnected) {
        completed = false;
        tryFocusTarget();
        return;
      }

      row.classList.remove("attention-focus-flash");
      void row.offsetWidth;
      row.classList.add("attention-focus-flash");

      animationTimer = window.setTimeout(() => {
        row.classList.remove("attention-focus-flash");
        onComplete(request.requestId);
      }, 1500);
    }

    function finish(row: HTMLTableRowElement) {
      if (completed) {
        return;
      }

      completed = true;
      row.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });

      const startedAt = performance.now();
      let previousTop = row.getBoundingClientRect().top;
      let stableFrameCount = 0;

      function waitForScrollToSettle() {
        if (!row.isConnected) {
          scrollFrame = null;
          completed = false;
          tryFocusTarget();
          return;
        }

        const currentTop = row.getBoundingClientRect().top;
        stableFrameCount =
          Math.abs(currentTop - previousTop) < 0.5
            ? stableFrameCount + 1
            : 0;
        previousTop = currentTop;

        const elapsed = performance.now() - startedAt;
        if (
          (elapsed >= 100 && stableFrameCount >= 3) ||
          elapsed >= 1000
        ) {
          scrollFrame = null;
          startFlash(row);
          return;
        }

        scrollFrame = window.requestAnimationFrame(waitForScrollToSettle);
      }

      scrollFrame = window.requestAnimationFrame(waitForScrollToSettle);
    }

    function tryFocusTarget() {
      if (completed) {
        return;
      }

      if (isAuditNavigationItem(request.item)) {
        const auditItem = request.item;

        switch (auditItem.entityType) {
          case "asset": {
            const row = findRow(
              ".assets-table tbody tr",
              auditItem.id,
              auditItem.matchText,
            );

            if (row) {
              finish(row);
            }
            return;
          }

          case "system": {
            const row = findRow(
              ".structure-systems-table tbody tr",
              auditItem.id,
              auditItem.matchText,
            );

            if (row) {
              finish(row);
            }
            return;
          }

          case "subsystem": {
            const row = findRow(
              ".structure-subsystems-table tbody tr",
              auditItem.id,
              auditItem.matchText,
            );

            if (row) {
              finish(row);
            }
            return;
          }

          case "issue": {
            const row = findRow(
              ".issues-table tbody tr",
              auditItem.id,
              auditItem.matchText,
            );

            if (row) {
              finish(row);
            }
            return;
          }

          case "test_record": {
            const row = findRow(
              ".checklists-tests-table tbody tr",
              auditItem.id,
              auditItem.matchText,
            );

            if (row) {
              finish(row);
            }
            return;
          }

          case "test_item": {
            const itemRow = findRow(
              ".test-record-items-table tbody tr",
              auditItem.id,
              auditItem.matchText,
            );

            if (itemRow) {
              finish(itemRow);
              return;
            }

            if (openedParentRecord || !auditItem.parentId) {
              return;
            }

            const recordRow = findRow(
              ".checklists-tests-table tbody tr",
              auditItem.parentId,
              "",
            );
            const openButton = recordRow?.querySelector<HTMLButtonElement>(
              ".test-record-title-button",
            );

            if (openButton) {
              openedParentRecord = true;
              openButton.click();
            }
            return;
          }

          case "document": {
            const row = findRow(
              ".documents-table tbody tr",
              auditItem.id,
              auditItem.matchText,
            );

            if (row) {
              finish(row);
            }
            return;
          }

          case "turnover_package": {
            const row = findRow(
              ".turnover-packages-table tbody tr",
              auditItem.id,
              auditItem.matchText,
            );

            if (row) {
              finish(row);
            }
            return;
          }

          case "project":
            return;
        }

        return;
      }

      switch (request.item.type) {
        case "blocked_asset":
        case "incomplete_asset": {
          const row = findRow(
            ".assets-table tbody tr",
            request.item.id,
            request.item.matchText,
          );

          if (row) {
            finish(row);
          }
          return;
        }

        case "critical_issue":
        case "overdue_issue": {
          const row = findRow(
            ".issues-table tbody tr",
            request.item.id,
            request.item.matchText,
          );

          if (row) {
            finish(row);
          }
          return;
        }

        case "failed_test_item":
        case "pending_test_item": {
          const itemRow = findRow(
            ".test-record-items-table tbody tr",
            request.item.id,
            request.item.matchText,
          );

          if (itemRow) {
            finish(itemRow);
            return;
          }

          if (openedParentRecord || !request.item.parentId) {
            return;
          }

          const recordRow = findRow(
            ".checklists-tests-table tbody tr",
            request.item.parentId,
            request.item.parentTitle ?? request.item.detail,
          );

          const openButton = recordRow?.querySelector<HTMLButtonElement>(
            ".test-record-title-button",
          );

          if (openButton) {
            openedParentRecord = true;
            openButton.click();
          }
          return;
        }

        case "unsigned_test_record": {
          const row = findRow(
            ".checklists-tests-table tbody tr",
            request.item.id,
            request.item.matchText,
          );

          if (row) {
            finish(row);
          }
          return;
        }

        case "required_document": {
          const row = findRow(
            ".documents-table tbody tr",
            request.item.id,
            request.item.matchText,
          );

          if (row) {
            finish(row);
          }
          return;
        }

        case "system_readiness": {
          const row = findRow(
            ".structure-systems-table tbody tr",
            request.item.id,
            request.item.matchText,
          );

          if (row) {
            finish(row);
          }
          return;
        }
      }
    }

    const root =
      document.querySelector<HTMLElement>(".page-content") ??
      document.body;
    const observer = new MutationObserver(tryFocusTarget);

    observer.observe(root, {
      childList: true,
      subtree: true,
    });

    const retryTimer = window.setInterval(tryFocusTarget, 100);
    const expiryTimer = window.setTimeout(() => {
      if (!completed) {
        onComplete(request.requestId);
      }
    }, 12000);

    tryFocusTarget();

    return () => {
      observer.disconnect();
      window.clearInterval(retryTimer);
      window.clearTimeout(expiryTimer);

      if (animationTimer !== null) {
        window.clearTimeout(animationTimer);
      }

      if (scrollFrame !== null) {
        window.cancelAnimationFrame(scrollFrame);
      }
    };
  }, [activePage, onComplete, target]);

  return null;
}

export default AttentionFocusManager;
