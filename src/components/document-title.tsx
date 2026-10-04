"use client";

import { useEffect } from "react";

export function DocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = `${title} — IURIVERSE`;
  }, [title]);

  return null;
}
