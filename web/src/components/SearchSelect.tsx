import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { containsText } from "../lib/filter.js";

interface Props {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

// A search box with a list of choices. Whatever is typed filters the board straight away.
export function SearchSelect({ label, value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  // After a choice is made, show the whole list again so it's easy to switch.
  const shown = options.includes(value) ? options : options.filter((option) => containsText(option, value));
  const expanded = open && shown.length > 0;

  function choose(option: string) {
    onChange(option);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setOpen(true);
      if (active < 0) setActive(step > 0 ? 0 : shown.length - 1);
      else if (shown.length > 0) setActive((active + step + shown.length) % shown.length);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    } else if (e.key === "Enter" && expanded && shown[active] !== undefined) {
      e.preventDefault();
      choose(shown[active]);
    }
  }

  return (
    <div
      className="search-select"
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setOpen(false);
        setActive(-1);
      }}
    >
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={expanded}
        aria-autocomplete="list"
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={label}
        value={value}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
      />
      {value && (
        <button
          type="button"
          className="clear"
          aria-label={`Clear ${label}`}
          onClick={() => {
            input.current?.focus(); // the button is about to disappear, so keep the visitor's place
            choose("");
          }}
        >
          ×
        </button>
      )}
      {expanded && (
        <ul id={listId} role="listbox" aria-label={label}>
          {shown.map((option, i) => (
            <li
              key={option}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={option === value}
              className={i === active ? "active" : undefined}
              onMouseDown={(e) => e.preventDefault()} // keeps focus in the box so the click lands
              onClick={() => choose(option)}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
