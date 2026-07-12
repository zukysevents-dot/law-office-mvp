"use client";

import { useEffect } from "react";

export function DocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = `${title} — syndikat.legal`;
  }, [title]);

  return null;
}
