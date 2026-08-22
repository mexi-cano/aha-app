import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ReviewIssueGroupNotice } from "../components/aha/review-issue-notice";

test("emergency contact warning offers Check without Not applicable", () => {
  const markup = renderToStaticMarkup(
    createElement(ReviewIssueGroupNotice, {
      group: {
        key: "details:warning",
        tier: "warning",
        issues: [
          {
            tier: "warning",
            code: "emergency_contact_format",
            message:
              "Check that this includes the number the crew should call.",
            target: { section: "details", field: "emergencyNumber" },
          },
        ],
      },
      onFix: () => undefined,
      onNotApplicable: () => undefined,
    }),
  );
  assert.match(markup, />Check</);
  assert.doesNotMatch(markup, /Not applicable/);
});
