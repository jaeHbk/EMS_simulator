// Top-bar scenario picker. Click → popover with search + listbox;
// arrow-keys navigate; Enter selects; Esc closes.
//
// A11y pattern: the popover behaves like a combobox-with-listbox. The
// search input retains keyboard focus; the listbox uses
// aria-activedescendant to highlight a row, so screen readers announce
// the active option as the user arrows through. Buttons inside listboxes
// are invalid ARIA — rows are <div role="option"> instead.
//
// "Selecting" today is a no-op besides closing — actually switching the
// running scenario lands with the run-control RPCs in the next cycle.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Scenario, StreamStatus } from '../../lib/stream';
import { useScenarios } from './useScenarios';

interface Props {
  status: StreamStatus;
}

export function ScenarioPicker({ status }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);

  const activeScenarioId =
    status.kind === 'connected' ? status.scenario : null;

  const { scenarios, loading, error, reload } = useScenarios();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scenarios;
    return scenarios.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.chief_complaint.toLowerCase().includes(q),
    );
  }, [query, scenarios]);

  // Close on outside click + Esc, both returning focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const dismiss = (): void => {
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') dismiss();
    };
    const onClick = (e: MouseEvent): void => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        dismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  // Focus the search input on open.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Scroll the highlighted row into view as the user arrows.
  useEffect(() => {
    if (!open || !listboxRef.current) return;
    const el = listboxRef.current.querySelector<HTMLElement>(
      `#scenario-row-${highlightedIdx}`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, highlightedIdx]);

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = filtered[highlightedIdx];
      if (s) handleSelect(s);
    }
  };

  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleSelect = (s: Scenario): void => {
    if (s.id === activeScenarioId) {
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    setLoadingId(s.id);
    fetch('/api/run/restart', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scenario_id: s.id }),
    })
      .catch(() => {})
      .finally(() => {
        setLoadingId(null);
        setOpen(false);
        buttonRef.current?.focus();
      });
  };

  const buttonLabel = (() => {
    if (status.kind !== 'connected') return 'Loading scenario…';
    const active = scenarios.find((s) => s.id === activeScenarioId);
    return active?.name ?? activeScenarioId ?? 'Choose scenario';
  })();

  const activeRowId =
    open && filtered.length > 0
      ? `scenario-row-${highlightedIdx}`
      : undefined;

  return (
    <div className="scenario-picker">
      <button
        ref={buttonRef}
        type="button"
        className="scenario-picker__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="scenario-picker__label">{buttonLabel}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          ref={popoverRef}
          className="scenario-popover"
          role="dialog"
          aria-modal="false"
          aria-label="Scenario picker"
        >
          <input
            ref={inputRef}
            type="search"
            className="scenario-popover__search"
            placeholder="Search scenarios…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIdx(0);
            }}
            onKeyDown={onInputKeyDown}
            aria-label="Search scenarios"
            role="combobox"
            aria-controls="scenario-listbox"
            aria-expanded={true}
            aria-activedescendant={activeRowId}
            aria-autocomplete="list"
          />
          <div
            ref={listboxRef}
            className="scenario-popover__list"
            id="scenario-listbox"
            role="listbox"
            aria-label="Scenarios"
          >
            {loading && <div className="scenario-popover__hint">Loading…</div>}
            {error && (
              <div className="scenario-popover__hint scenario-popover__hint--error">
                <span>Failed: {error}</span>
                <button type="button" onClick={reload}>retry</button>
              </div>
            )}
            {!loading && !error && filtered.length === 0 && (
              <div className="scenario-popover__hint">No matches.</div>
            )}
            {filtered.map((s, idx) => (
              <div
                key={s.id}
                id={`scenario-row-${idx}`}
                className={`scenario-row ${idx === highlightedIdx ? 'is-active' : ''}`}
                role="option"
                aria-selected={idx === highlightedIdx}
                onMouseEnter={() => setHighlightedIdx(idx)}
                onClick={() => handleSelect(s)}
              >
                <div className="scenario-row__name">
                  {s.name}
                  {s.id === activeScenarioId && (
                    <>
                      <span aria-hidden="true" className="scenario-row__active">
                        ●
                      </span>
                      <span className="visually-hidden">(active)</span>
                    </>
                  )}
                  {s.id === loadingId && (
                    <span className="scenario-row__active">⏳</span>
                  )}
                </div>
                <div className="scenario-row__meta">
                  <span className={`scenario-row__diff diff--${s.difficulty}`}>
                    {s.difficulty}
                  </span>
                  <span>{Math.round(s.duration_s / 60)}m</span>
                  <span className="scenario-row__cc">{s.chief_complaint}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
