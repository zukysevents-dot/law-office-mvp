import type { ReactNode } from "react";

import { parseRichText } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

// Vykreslí omezený formát ze src/lib/rich-text.ts (**tučně**, __podtrženo__,
// *kurzíva*). Jen React elementy, žádné HTML z uloženého textu.
export function RichText({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const segments = parseRichText(value);
  return (
    <div className={cn("whitespace-pre-wrap break-words", className)}>
      {segments.map((segment, index) => {
        let node: ReactNode = segment.text;
        if (segment.italic) {
          node = <em>{node}</em>;
        }
        if (segment.underline) {
          node = <u className="underline-offset-2">{node}</u>;
        }
        if (segment.bold) {
          node = <strong className="font-semibold">{node}</strong>;
        }
        return <span key={index}>{node}</span>;
      })}
    </div>
  );
}
