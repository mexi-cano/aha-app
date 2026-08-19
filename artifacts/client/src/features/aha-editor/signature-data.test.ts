import assert from "node:assert/strict";
import test from "node:test";
import type { PointGroup } from "signature_pad";

import { scaleSignatureData } from "./signature-data";

test("signature resize scaling preserves strokes without mutating source data", () => {
  const source: PointGroup[] = [
    {
      dotSize: 2,
      minWidth: 1,
      maxWidth: 3,
      penColor: "#191D2B",
      velocityFilterWeight: 0.7,
      compositeOperation: "source-over",
      points: [
        { x: 10, y: 20, pressure: 0.5, time: 1 },
        { x: 30, y: 40, pressure: 0.7, time: 2 },
      ],
    },
  ];

  const scaled = scaleSignatureData(source, 2, 0.5);
  assert.deepEqual(
    scaled[0]?.points.map(({ x, y }) => ({ x, y })),
    [
      { x: 20, y: 10 },
      { x: 60, y: 20 },
    ],
  );
  assert.equal(scaled[0]?.dotSize, 1);
  assert.equal(scaled[0]?.minWidth, 0.5);
  assert.equal(scaled[0]?.maxWidth, 1.5);
  assert.equal(source[0]?.points[0]?.x, 10);
});
