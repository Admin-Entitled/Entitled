import React, { useEffect, useMemo, useRef, useState } from "react";

import { formatExpenseMonthLabel } from "./expensesView.js";

export default function ExpenseMonthSelector({
  months,
  selectedMonth,
  onChange,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  const selectedIndex = useMemo(
    () => Math.max(0, months.findIndex((month) => month === selectedMonth)),
    [months, selectedMonth],
  );

  useEffect(() => {
    setActiveIndex(selectedIndex);
  }, [selectedIndex]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    listRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const next = listRef.current?.querySelector(`[data-month-option-index="${activeIndex}"]`);
    next?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const closeMenu = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const openMenu = (startIndex = selectedIndex) => {
    if (disabled || months.length === 0) {
      return;
    }
    setActiveIndex(Math.max(0, Math.min(startIndex, months.length - 1)));
    setOpen(true);
  };

  const commitSelection = (month) => {
    if (!month || month === selectedMonth) {
      closeMenu();
      return;
    }
    onChange(month);
    closeMenu();
  };

  const handleTriggerKeyDown = (event) => {
    if (disabled) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openMenu(selectedIndex + 1 < months.length ? selectedIndex + 1 : selectedIndex);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(selectedIndex > 0 ? selectedIndex - 1 : selectedIndex);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openMenu(selectedIndex);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  const handleListKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(months.length - 1, index + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(months.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commitSelection(months[activeIndex]);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="expenses-month-selector" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="button compact expenses-month-trigger"
        aria-expanded={open ? "true" : "false"}
        aria-haspopup="listbox"
        aria-controls="expenses-month-listbox"
        onClick={() => (open ? closeMenu() : openMenu(selectedIndex))}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
      >
        <span>{formatExpenseMonthLabel(selectedMonth)}</span>
        <span aria-hidden="true" className={`expenses-month-trigger-chevron${open ? " is-open" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="expenses-month-popover">
          <div
            id="expenses-month-listbox"
            role="listbox"
            aria-label="Expense months"
            aria-activedescendant={`expenses-month-option-${activeIndex}`}
            className="expenses-month-listbox"
            ref={listRef}
            tabIndex={-1}
            onKeyDown={handleListKeyDown}
          >
            {months.map((month, index) => {
              const selected = month === selectedMonth;
              const active = index === activeIndex;
              return (
                <button
                  id={`expenses-month-option-${index}`}
                  key={month}
                  type="button"
                  role="option"
                  aria-selected={selected ? "true" : "false"}
                  data-month-option-index={index}
                  className={`expenses-month-option${selected ? " is-selected" : ""}${active ? " is-active" : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => commitSelection(month)}
                >
                  <span>{formatExpenseMonthLabel(month)}</span>
                  <span className="expenses-month-option-check" aria-hidden="true">{selected ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
