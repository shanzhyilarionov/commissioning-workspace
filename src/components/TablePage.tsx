import type { ComponentPropsWithoutRef } from "react";

export default function TablePage({
  className = "",
  children,
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      {...props}
      className={`content-card section-card table-page ${className}`.trim()}
    >
      {children}
    </section>
  );
}
