import { Button } from "@/components/ui/button";

const CONTINUE_GUIDANCE =
  "You can continue now. Review will collect anything required before signing.";

export function EditorContinue({
  next,
  onContinue,
}: {
  next: string;
  onContinue: () => void;
}) {
  return (
    <div className="pt-1">
      <Button
        className="min-h-[72px] w-full rounded-[14px] text-xl font-bold tracking-wide"
        onClick={onContinue}
      >
        CONTINUE
      </Button>
      <p className="mx-auto mt-3 max-w-[560px] text-center text-[15px] font-medium leading-6 text-muted-foreground">
        {CONTINUE_GUIDANCE}
      </p>
      <p className="mt-1 text-center text-[15px] font-semibold text-muted-foreground">
        Next: {next}
      </p>
    </div>
  );
}
