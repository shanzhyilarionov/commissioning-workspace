import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";

type FilterSelectProps = ComponentPropsWithoutRef<"select">;

// WebKit cannot ellipsize the text inside a <select>, so the visible box is a
// plain element and the real <select> sits invisibly on top of it. Clicks,
// keyboard use, the native menu and accessibility all still go to the select.
function FilterSelect({ className = "", children, ...selectProps }: FilterSelectProps) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [label, setLabel] = useState("");

  useLayoutEffect(() => {
    const nextLabel = selectRef.current?.selectedOptions[0]?.text ?? "";

    if (nextLabel !== label) {
      setLabel(nextLabel);
    }
  });

  return (
    <span className={`filter-select ${className}`.trim()}>
      <span className="filter-select-value" aria-hidden="true">
        {label}
      </span>
      <select ref={selectRef} title={label} {...selectProps}>
        {children}
      </select>
    </span>
  );
}

export default FilterSelect;
