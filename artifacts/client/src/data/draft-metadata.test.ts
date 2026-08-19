import assert from "node:assert/strict";
import test from "node:test";
import { requiresStartBlankConfirmation } from "@workspace/aha-domain";

import {
  createBlankDraftMetadata,
  createCopiedDraftMetadata,
  markDraftEdited,
  markPrefillBannerDismissed,
} from "./draft-metadata";

test("copied draft metadata independently tracks banner and edit state", () => {
  const copied = createCopiedDraftMetadata("today", "friday", "2026-08-14");
  assert.equal(copied.bannerDismissed, false);
  assert.equal(copied.hasUserEdits, false);
  assert.equal(requiresStartBlankConfirmation(copied.hasUserEdits), false);

  const dismissed = markPrefillBannerDismissed(copied);
  assert.equal(dismissed.bannerDismissed, true);
  assert.equal(dismissed.hasUserEdits, false);

  const edited = markDraftEdited(copied);
  assert.equal(edited.bannerDismissed, false);
  assert.equal(edited.hasUserEdits, true);
  assert.equal(requiresStartBlankConfirmation(edited.hasUserEdits), true);
});

test("starting blank resets prefill and edited state", () => {
  const reset = createBlankDraftMetadata("today");
  assert.deepEqual(reset, {
    ahaId: "today",
    sourceAhaId: null,
    sourceDate: null,
    bannerDismissed: true,
    hasUserEdits: false,
  });
});
