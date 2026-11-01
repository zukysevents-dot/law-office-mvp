"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

/**
 * Renders nothing; calls `onDone` once the surrounding <form>'s action has
 * finished (pending true → false), i.e. after the server action and the
 * page re-render it triggered. Used to close a dialog that holds the form.
 * Must be rendered inside the <form>.
 */
export function FormDoneWatcher({ onDone }: { onDone: () => void }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
    } else if (wasPending.current) {
      wasPending.current = false;
      onDoneRef.current();
    }
  }, [pending]);

  return null;
}
