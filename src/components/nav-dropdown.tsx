"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

const ITEM_CLASS =
  "block w-full px-3 py-2 text-start text-sm hover:bg-gray-100 focus:bg-gray-100 dark:hover:bg-gray-900 dark:focus:bg-gray-900";

/**
 * Menu-button pattern (WAI-ARIA APG). Hand-rolled: this repo ships no Radix or shadcn
 * primitives, only clsx + tailwind-merge + lucide-react.
 *
 * Trigger carries aria-expanded / aria-haspopup="menu"; ArrowDown and ArrowUp open the
 * panel onto the first or last item. Inside the panel arrows cycle, Home/End jump,
 * Escape closes and returns focus to the trigger, Tab closes and lets focus move on.
 * Pointer-down outside closes. A pathname change closes it, because unlike a per-page
 * nav this header survives navigation.
 */
export function NavDropdown({
  triggerContent,
  ariaLabel,
  current = false,
  align = "start",
  triggerClassName = "",
  children,
}: {
  triggerContent: ReactNode;
  ariaLabel?: string;
  current?: boolean;
  align?: "start" | "end";
  triggerClassName?: string;
  children: ReactNode;
}) {
  // Openness is stored as "the path this menu was opened on", so navigating closes it
  // for free — the header outlives the route, and an effect that setStates on pathname
  // change would just be a cascading re-render.
  const pathname = usePathname() ?? "/";
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const pendingFocus = useRef<"first" | "last" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const setOpen = (next: boolean) => setOpenPath(next ? pathname : null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenPath(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const itemsOf = () =>
    Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  const focusAt = (index: number) => {
    const items = itemsOf();
    if (items.length === 0) return;
    items[((index % items.length) + items.length) % items.length].focus();
  };

  // Keyboard opens land on an edge item, but only once the panel has committed.
  useEffect(() => {
    const edge = pendingFocus.current;
    if (!open || !edge) return;
    pendingFocus.current = null;
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    items[edge === "first" ? 0 : items.length - 1]?.focus();
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpenPath(null);
    if (returnFocus) triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const edge = e.key === "ArrowDown" ? "first" : "last";
      // Already open? No state change would occur, so the focus effect would never fire.
      if (open) focusAt(edge === "first" ? 0 : -1);
      else {
        pendingFocus.current = edge;
        setOpen(true);
      }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close(true);
    }
  };

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    const at = itemsOf().indexOf(document.activeElement as HTMLElement);
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusAt(at + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusAt(at - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAt(0);
        break;
      case "End":
        e.preventDefault();
        focusAt(-1);
        break;
      case "Escape":
        e.preventDefault();
        close(true);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? panelId : undefined}
        aria-label={ariaLabel}
        data-current={current || undefined}
        onClick={() => setOpenPath((prev) => (prev === pathname ? null : pathname))}
        onKeyDown={onTriggerKeyDown}
        className={`inline-flex items-center gap-1 rounded px-2 py-1.5 hover:underline data-[current]:font-semibold ${FOCUS_RING} ${triggerClassName}`}
      >
        {triggerContent}
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M1 4l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="menu"
          aria-label={ariaLabel}
          onKeyDown={onPanelKeyDown}
          className={`absolute top-full z-50 mt-1 min-w-max rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-800 dark:bg-gray-950 ${
            align === "end" ? "end-0" : "start-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Internal destination — keeps next/link's client-side transitions. */
export function NavMenuLink({
  href,
  current,
  children,
  className = "",
}: {
  href: string;
  current?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      tabIndex={-1}
      aria-current={current ? "page" : undefined}
      className={`${ITEM_CLASS} ${FOCUS_RING} aria-[current=page]:font-semibold ${className}`}
    >
      {children}
    </Link>
  );
}

/** Full-page navigation — used by the locale switch, which must send a Referer. */
export function NavMenuAnchor({
  href,
  children,
  className = "",
  ...rest
}: { href: string; children: ReactNode; className?: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      href={href}
      role="menuitem"
      tabIndex={-1}
      className={`${ITEM_CLASS} ${FOCUS_RING} ${className}`}
      {...rest}
    >
      {children}
    </a>
  );
}

/** A menu row that submits (sign-out). Lives inside its own <form>. */
export function NavMenuButton({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <button type="submit" role="menuitem" tabIndex={-1} className={`${ITEM_CLASS} ${FOCUS_RING} ${className}`}>
      {children}
    </button>
  );
}
