import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { HistoryTurn } from "../api/contract";
import { ChatPanel } from "./ChatPanel";

const TRANSCRIPT: HistoryTurn[] = [
  { role: "trainee", text: "When did the pain start?" },
  { role: "patient", text: "About two hours ago." },
];

describe("ChatPanel", () => {
  it("renders the transcript turns with their data-role markers", () => {
    const { container } = render(
      <ChatPanel transcript={TRANSCRIPT} onSend={() => {}} />,
    );
    expect(screen.getByText("When did the pain start?")).toBeInTheDocument();
    expect(screen.getByText("About two hours ago.")).toBeInTheDocument();
    expect(container.querySelector('[data-role="trainee"]')).toHaveTextContent(
      "When did the pain start?",
    );
    expect(container.querySelector('[data-role="patient"]')).toHaveTextContent(
      "About two hours ago.",
    );
  });

  it("calls onSend with the typed (trimmed) text and clears the composer", () => {
    const onSend = vi.fn();
    render(<ChatPanel transcript={[]} onSend={onSend} />);

    const textarea = screen.getByLabelText(/question to patient/i);
    fireEvent.change(textarea, { target: { value: "  Any chest pain?  " } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("Any chest pain?");
    expect(textarea).toHaveValue("");
  });

  it("does not call onSend when disabled", () => {
    const onSend = vi.fn();
    render(<ChatPanel transcript={[]} onSend={onSend} disabled />);

    const textarea = screen.getByLabelText(/question to patient/i);
    fireEvent.change(textarea, { target: { value: "ignored" } });
    fireEvent.submit(textarea.closest("form") as HTMLFormElement);

    expect(onSend).not.toHaveBeenCalled();
  });

  describe("when pending is null/absent", () => {
    it("renders neither the optimistic bubble nor the typing indicator", () => {
      const { container } = render(
        <ChatPanel transcript={TRANSCRIPT} onSend={() => {}} />,
      );
      expect(container.querySelector('[data-pending="true"]')).toBeNull();
      expect(container.querySelector('[data-typing="true"]')).toBeNull();
      expect(
        screen.queryByRole("status", { name: /patient is typing/i }),
      ).not.toBeInTheDocument();
    });

    it("explicitly null behaves the same", () => {
      const { container } = render(
        <ChatPanel transcript={TRANSCRIPT} onSend={() => {}} pending={null} />,
      );
      expect(container.querySelector('[data-pending="true"]')).toBeNull();
      expect(container.querySelector('[data-typing="true"]')).toBeNull();
    });
  });

  describe("when pending is set", () => {
    it("renders the optimistic trainee bubble with the pending text", () => {
      const { container } = render(
        <ChatPanel
          transcript={[]}
          onSend={() => {}}
          pending="Any shortness of breath?"
        />,
      );
      const optimistic = container.querySelector('[data-pending="true"]');
      expect(optimistic).not.toBeNull();
      expect(optimistic).toHaveAttribute("data-role", "trainee");
      expect(optimistic).toHaveTextContent("Any shortness of breath?");
    });

    it("renders the 'patient is typing' indicator", () => {
      render(
        <ChatPanel transcript={[]} onSend={() => {}} pending="Any nausea?" />,
      );
      expect(
        screen.getByRole("status", { name: /patient is typing/i }),
      ).toBeInTheDocument();
    });

    it("still renders the prior transcript above the optimistic turns", () => {
      const { container } = render(
        <ChatPanel
          transcript={TRANSCRIPT}
          onSend={() => {}}
          pending="A follow-up question"
        />,
      );
      expect(screen.getByText("When did the pain start?")).toBeInTheDocument();
      expect(container.querySelector('[data-pending="true"]')).toHaveTextContent(
        "A follow-up question",
      );
    });

    it("does not show the empty-state copy while pending on an empty transcript", () => {
      render(<ChatPanel transcript={[]} onSend={() => {}} pending="First question" />);
      expect(
        screen.queryByText(/no questions asked yet/i),
      ).not.toBeInTheDocument();
    });
  });

  describe("auto-scroll to the newest turn", () => {
    // jsdom does not implement scrollIntoView; define a spy on the prototype so
    // the component's guarded `endRef.current?.scrollIntoView?.(...)` finds it.
    let scrollSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      scrollSpy = vi.fn();
      Element.prototype.scrollIntoView = scrollSpy;
    });

    afterEach(() => {
      // Remove the stub so it doesn't leak to other suites.
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    });

    it("scrolls the sentinel into view on initial render", () => {
      render(<ChatPanel transcript={TRANSCRIPT} onSend={() => {}} />);
      expect(scrollSpy).toHaveBeenCalled();
    });

    it("scrolls again when the transcript grows", () => {
      const { rerender } = render(
        <ChatPanel transcript={TRANSCRIPT} onSend={() => {}} />,
      );
      const initialCalls = scrollSpy.mock.calls.length;

      const grown: HistoryTurn[] = [
        ...TRANSCRIPT,
        { role: "trainee", text: "Any nausea?" },
        { role: "patient", text: "A little." },
      ];
      rerender(<ChatPanel transcript={grown} onSend={() => {}} />);

      expect(scrollSpy.mock.calls.length).toBeGreaterThan(initialCalls);
    });

    it("scrolls when the pending typing indicator toggles on", () => {
      const { rerender } = render(
        <ChatPanel transcript={TRANSCRIPT} onSend={() => {}} />,
      );
      const initialCalls = scrollSpy.mock.calls.length;

      rerender(
        <ChatPanel transcript={TRANSCRIPT} onSend={() => {}} pending="Anything else?" />,
      );

      expect(scrollSpy.mock.calls.length).toBeGreaterThan(initialCalls);
    });

    it("uses non-smooth behavior when prefers-reduced-motion is set", () => {
      const matchMediaSpy = vi
        .spyOn(window, "matchMedia")
        .mockImplementation((query: string) => ({
          matches: query.includes("reduce"),
          media: query,
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList);

      render(<ChatPanel transcript={TRANSCRIPT} onSend={() => {}} />);

      expect(scrollSpy).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: "auto" }),
      );
      matchMediaSpy.mockRestore();
    });
  });
});
