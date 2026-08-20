import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import SignaturePad from "signature_pad";
import type { PointGroup } from "signature_pad";

import { scaleSignatureData } from "@/features/aha-editor/signature-data";
import { cn } from "@/lib/utils";

export interface SignatureCanvasHandle {
  clear: () => void;
  isEmpty: () => boolean;
  toData: () => PointGroup[];
  toPng: () => string | null;
}

interface SignatureCanvasProps {
  ariaLabel?: string;
  disabled?: boolean;
  initialData?: readonly PointGroup[];
  onInkChange?: (hasInk: boolean) => void;
  placeholder?: string;
}

export const SignatureCanvas = forwardRef<
  SignatureCanvasHandle,
  SignatureCanvasProps
>(({ ariaLabel, disabled = false, initialData = [], onInkChange, placeholder }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const dimensionsRef = useRef({ width: 0, height: 0 });
  const onInkChangeRef = useRef(onInkChange);
  const [hasInk, setHasInk] = useState(false);
  const canvasAriaLabel =
    ariaLabel ?? "Signature drawing area. Sign here with your finger.";
  const canvasPlaceholder = placeholder ?? "Sign here with your finger";
  onInkChangeRef.current = onInkChange;

  const updateInkState = (value: boolean) => {
    setHasInk(value);
    onInkChangeRef.current?.(value);
  };

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const previous = dimensionsRef.current;
      if (previous.width === width && previous.height === height) return;

      const pad = padRef.current;
      const points = pad?.toData() ?? [];
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.getContext("2d")?.scale(ratio, ratio);

      if (pad && points.length) {
        pad.fromData(
          previous.width && previous.height
            ? scaleSignatureData(
                points,
                width / previous.width,
                height / previous.height,
              )
            : points,
        );
      }
      dimensionsRef.current = { width, height };
      if (pad) updateInkState(!pad.isEmpty());
    };

    resize();
    const pad = new SignaturePad(canvas, {
      penColor: "#191D2B",
      backgroundColor: "rgba(0,0,0,0)",
      minWidth: 0.8,
      maxWidth: 3.2,
      throttle: 8,
    });
    padRef.current = pad;
    if (initialData.length) {
      pad.fromData([...initialData]);
      updateInkState(true);
    }
    const handleEndStroke = () => updateInkState(!pad.isEmpty());
    pad.addEventListener("endStroke", handleEndStroke);

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      pad.removeEventListener("endStroke", handleEndStroke);
      pad.off();
      padRef.current = null;
    };
  }, []);

  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;
    if (disabled) pad.off();
    else pad.on();
  }, [disabled]);

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        padRef.current?.clear();
        updateInkState(false);
      },
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      toData: () => padRef.current?.toData() ?? [],
      toPng: () => {
        const pad = padRef.current;
        return pad && !pad.isEmpty() ? pad.toDataURL("image/png") : null;
      },
    }),
    [],
  );

  return (
    <div
      className={cn(
        "relative h-[250px] overflow-hidden rounded-[14px] border-2 border-dashed bg-card",
        hasInk ? "border-primary" : "border-[#C6CDE8]",
        disabled && "opacity-80",
      )}
    >
      <canvas
        ref={canvasRef}
        className="size-full touch-none"
        aria-label={canvasAriaLabel}
        aria-disabled={disabled}
      />
      {!hasInk ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-lg font-medium text-[#8A93AC]">
          {canvasPlaceholder}
        </span>
      ) : null}
      <span
        className="pointer-events-none absolute bottom-11 left-8 right-8 border-b border-[#C6CDE8]"
        aria-hidden="true"
      />
      <span
        className="pointer-events-none absolute bottom-12 left-8 text-xl text-[#8A93AC]"
        aria-hidden="true"
      >
        ✕
      </span>
    </div>
  );
});

SignatureCanvas.displayName = "SignatureCanvas";
