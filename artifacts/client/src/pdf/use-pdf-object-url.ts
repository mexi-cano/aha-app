import { useEffect, useState } from "react";

import type { AhaPdfRecord } from "@/data/database";

import { pdfBlob } from "./pdf-service";

export function usePdfObjectUrl(
  record: AhaPdfRecord | null | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    if (!record) return;

    const nextUrl = URL.createObjectURL(pdfBlob(record));
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [record]);

  return url;
}
