import { useEffect, useState } from "react";

import { SPINNER } from "./palette.ts";

/** A braille spinner frame that advances while `active`. */
export const useSpinner = function useSpinner(active: boolean, intervalMs = 80): string {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % SPINNER.length);
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [active, intervalMs]);
  return SPINNER[frame] ?? SPINNER[0];
};
