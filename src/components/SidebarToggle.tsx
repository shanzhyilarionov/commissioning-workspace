interface SidebarToggleProps {
  isCollapsed: boolean;
  sidebarId: string;
  onToggle: () => void;
}

function SidebarToggle({ isCollapsed, sidebarId, onToggle }: SidebarToggleProps) {
  return (
    <button
      className="sidebar-toggle"
      type="button"
      aria-controls={sidebarId}
      aria-expanded={!isCollapsed}
      aria-label={isCollapsed ? "Show sidebar" : "Hide sidebar"}
      onClick={onToggle}
    >
      <svg width="6" height="16" viewBox="0 0 6 16" fill="none" aria-hidden="true">
        <path
          d="M4.75 1.5 1.25 8l3.5 6.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export default SidebarToggle;
