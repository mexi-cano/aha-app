import assert from "node:assert/strict";
import test from "node:test";

import { START_WITHOUT_PREVIOUS_WORK_COPY } from "@/components/aha/prefill-banner";

test("prefill reset copy describes preserved job context and cleared daily work", () => {
  assert.deepEqual(START_WITHOUT_PREVIOUS_WORK_COPY, {
    action: "Start without previous work",
    title: "Start without previous work?",
    body: "This keeps your saved job details and crew. It clears the copied description, tasks, meeting notes, Energy selections, rescue-plan answer, and safety check.",
    cancel: "Keep copied AHA",
  });
});
