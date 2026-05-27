import type { ReactNode } from "react";
import { GLOSSARY } from "../glossary";

interface AbbrProps {
  // Glossary key, e.g. "BB", "PO", "AVG". Used to look up the tooltip
  // description from the central GLOSSARY map.
  code: string;
  // Optional override tooltip text. Falls back to GLOSSARY[code].
  title?: string;
  // Optional visible text. Defaults to the code itself so `<Abbr code="BB" />`
  // renders "BB".
  children?: ReactNode;
  className?: string;
}

// Inline abbreviation with a hover/focus tooltip. Uses the native `title`
// attribute so it works on desktop hover, keyboard focus, and long-press on
// touch devices without any tooltip library.
export function Abbr({ code, title, children, className }: AbbrProps) {
  const tip = title ?? GLOSSARY[code] ?? code;
  const cls = ["abbr", className].filter(Boolean).join(" ");
  return (
    <span className={cls} title={tip} tabIndex={0}>
      {children ?? code}
    </span>
  );
}
