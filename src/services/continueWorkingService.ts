export const continueWorkingPages = [
  "Overview",
  "Assets",
  "Checklists & Tests",
  "Issues",
  "Documents",
  "Reports",
] as const;

export type ContinueWorkingPage =
  (typeof continueWorkingPages)[number];

export interface ContinueWorkingLocation {
  projectId: string;
  page: ContinueWorkingPage;
  visitedAt: string;
}

export interface ContinueWorkingItem extends ContinueWorkingLocation {
  projectName: string;
  isFallback: boolean;
}

const storageKey = "commissioning-workspace.continue-working.v1";

function isContinueWorkingPage(
  value: unknown,
): value is ContinueWorkingPage {
  return (
    typeof value === "string" &&
    continueWorkingPages.includes(value as ContinueWorkingPage)
  );
}

function isContinueWorkingLocation(
  value: unknown,
): value is ContinueWorkingLocation {
  if (!value || typeof value !== "object") {
    return false;
  }

  const location = value as Record<string, unknown>;

  return (
    typeof location.projectId === "string" &&
    location.projectId.trim().length > 0 &&
    isContinueWorkingPage(location.page) &&
    typeof location.visitedAt === "string" &&
    !Number.isNaN(new Date(location.visitedAt).getTime())
  );
}

export function loadContinueWorkingLocation(): ContinueWorkingLocation | null {
  try {
    const storedValue = window.localStorage.getItem(storageKey);

    if (!storedValue) {
      return null;
    }

    const parsedValue = JSON.parse(storedValue) as unknown;

    if (isContinueWorkingLocation(parsedValue)) {
      return parsedValue;
    }

    window.localStorage.removeItem(storageKey);
    return null;
  } catch {
    return null;
  }
}

export function saveContinueWorkingLocation(
  location: ContinueWorkingLocation,
): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(location));
  } catch {
  }
}

export function clearContinueWorkingLocation(): void {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
  }
}
