export const continueWorkingPages = [
  "Overview",
  "Assets",
  "Checklists & Tests",
  "Issues",
  "Documents",
  "Record reports",
  "Turnover packages",
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

function parseContinueWorkingPage(
  value: unknown,
): ContinueWorkingPage | null {
  if (value === "Reports") {
    return "Record reports";
  }

  return (
    typeof value === "string" &&
    continueWorkingPages.includes(value as ContinueWorkingPage)
      ? (value as ContinueWorkingPage)
      : null
  );
}

function parseContinueWorkingLocation(
  value: unknown,
): ContinueWorkingLocation | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const location = value as Record<string, unknown>;
  const page = parseContinueWorkingPage(location.page);

  if (
    typeof location.projectId === "string" &&
    location.projectId.trim().length > 0 &&
    page !== null &&
    typeof location.visitedAt === "string" &&
    !Number.isNaN(new Date(location.visitedAt).getTime())
  ) {
    return {
      projectId: location.projectId,
      page,
      visitedAt: location.visitedAt,
    };
  }

  return null;
}

export function loadContinueWorkingLocation(): ContinueWorkingLocation | null {
  try {
    const storedValue = window.localStorage.getItem(storageKey);

    if (!storedValue) {
      return null;
    }

    const parsedValue = JSON.parse(storedValue) as unknown;
    const location = parseContinueWorkingLocation(parsedValue);

    if (location) {
      return location;
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
