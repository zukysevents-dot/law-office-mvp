// esbuild aliases `next/link` to this shim so the bundle renders without the Next runtime.
// Renders the same <a> a navigated next/link produces; design-system styling is unaffected.
import * as React from "react";

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, children, ...props },
  ref,
) {
  return React.createElement("a", { href, ref, ...props }, children);
});

export default Link;
