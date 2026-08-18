import { useEffect, useState } from "react";
import { toLocalDate, type LocalDate } from "@workspace/aha-domain";

const getToday = (): LocalDate => toLocalDate(new Date());

export function useToday(): LocalDate {
  const [today, setToday] = useState(getToday);

  useEffect(() => {
    const refresh = () => setToday(getToday());
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1,
    );
    const timeout = window.setTimeout(
      refresh,
      nextMidnight.getTime() - now.getTime(),
    );

    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [today]);

  return today;
}
