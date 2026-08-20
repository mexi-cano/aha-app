import type { Aha, Job } from "@workspace/aha-domain";

import type { AhaPdfRecord } from "../data/database";
import { storeAhaPdf } from "../data/aha-repository";

import type { AhaPdfLayoutPlan, PdfFitIssue } from "./aha-pdf";
import { PDF_FAILURE_MESSAGE } from "./pdf-constants";
import { supportsNativeFileShare } from "./share-capability";

export type StoredPdfResult =
  | { status: "stored"; record: AhaPdfRecord }
  | { status: "fit_failed"; issues: PdfFitIssue[] }
  | { status: "failed"; message: string; cause: unknown };

export async function generateAndStoreAhaPdf(
  savedAha: Aha,
  job: Job,
): Promise<StoredPdfResult> {
  try {
    const [{ renderAhaPdf }, { loadAhaPdfAssets }] = await Promise.all([
      import("./aha-pdf"),
      import("./assets"),
    ]);
    const rendered = await renderAhaPdf(
      savedAha,
      job,
      await loadAhaPdfAssets(),
    );
    if (rendered.status !== "rendered") return rendered;
    const record = await storeAhaPdf(
      savedAha,
      rendered.filename,
      rendered.bytes,
    );
    return { status: "stored", record };
  } catch (cause) {
    return { status: "failed", message: PDF_FAILURE_MESSAGE, cause };
  }
}

export async function analyzeAhaPdfFit(
  aha: Aha,
  job: Job,
): Promise<AhaPdfLayoutPlan> {
  const pdf = await import("./aha-pdf");
  return pdf.analyzeAhaPdfFit(aha, job);
}

export function pdfBlob(record: AhaPdfRecord): Blob {
  return new Blob([record.bytes.slice(0)], { type: "application/pdf" });
}

export function downloadPdf(record: AhaPdfRecord): void {
  const url = URL.createObjectURL(pdfBlob(record));
  const link = document.createElement("a");
  link.href = url;
  link.download = record.filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export type SharePdfResult =
  | { status: "shared" | "downloaded" | "cancelled" }
  | { status: "failed"; error: unknown };

export interface PdfShareDependencies {
  navigator: {
    share?: (data?: ShareData) => Promise<void>;
    canShare?: (data?: ShareData) => boolean;
  };
  download: (record: AhaPdfRecord) => void;
  createFile: (record: AhaPdfRecord) => File;
}

function defaultShareDependencies(): PdfShareDependencies {
  return {
    navigator,
    download: downloadPdf,
    createFile: (record) =>
      new File([record.bytes.slice(0)], record.filename, {
        type: "application/pdf",
      }),
  };
}

export async function shareOrDownloadPdf(
  record: AhaPdfRecord,
  dependencies = defaultShareDependencies(),
): Promise<SharePdfResult> {
  try {
    const file = dependencies.createFile(record);
    const shareData = { files: [file], title: record.filename };
    const hasShare = typeof dependencies.navigator.share === "function";
    let canShareFiles: boolean | null = null;
    if (typeof dependencies.navigator.canShare === "function") {
      try {
        canShareFiles = dependencies.navigator.canShare(shareData);
      } catch {
        canShareFiles = false;
      }
    }
    if (!supportsNativeFileShare(hasShare, canShareFiles)) {
      dependencies.download(record);
      return { status: "downloaded" };
    }
    await dependencies.navigator.share!(shareData);
    return { status: "shared" };
  } catch (error) {
    if (
      error instanceof DOMException
        ? error.name === "AbortError"
        : Boolean(
            error &&
            typeof error === "object" &&
            "name" in error &&
            error.name === "AbortError",
          )
    ) {
      return { status: "cancelled" };
    }
    return { status: "failed", error };
  }
}
