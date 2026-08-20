import { useState } from "react";
import { Check } from "lucide-react";
import {
  enterCustomPersonInCharge,
  resolvePersonInChargeWorkerId,
  selectPersonInChargeWorker,
  type Aha,
} from "@workspace/aha-domain";

import { FieldRequirementBadge } from "@/components/aha/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PersonInChargeFieldProps {
  aha: Aha;
  updateAha: (update: (current: Aha) => Aha) => void;
}

interface PersonInChargeCrewChoicesProps {
  crew: Aha["crew"];
  selectedWorkerId: string | null;
  onSelect: (workerId: string) => void;
}

export function PersonInChargeCrewChoices({
  crew,
  selectedWorkerId,
  onSelect,
}: PersonInChargeCrewChoicesProps) {
  return crew.map((member) => {
    const selected = member.workerId === selectedWorkerId;
    return (
      <button
        key={member.workerId}
        type="button"
        aria-pressed={selected}
        className="flex min-h-12 items-center gap-3 rounded-[10px] border-[1.5px] border-border bg-card px-4 text-left text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onSelect(member.workerId)}
      >
        <span
          className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-[#8A93AC] text-transparent"
          }`}
          aria-hidden="true"
        >
          <Check className="size-4" strokeWidth={3} />
        </span>
        <span>{member.name}</span>
      </button>
    );
  });
}

export function PersonInChargeField({
  aha,
  updateAha,
}: PersonInChargeFieldProps) {
  const [crewDialogOpen, setCrewDialogOpen] = useState(false);
  const selectedWorkerId = resolvePersonInChargeWorkerId(aha);
  const selectedWorker = aha.crew.find(
    ({ workerId }) => workerId === selectedWorkerId,
  );

  const selectWorker = (workerId: string) => {
    updateAha((current) => selectPersonInChargeWorker(current, workerId));
    setCrewDialogOpen(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="person-in-charge"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-bold"
      >
        <span>Person in charge</span>
        <FieldRequirementBadge requirement="required" />
      </label>
      <input
        id="person-in-charge"
        aria-required="true"
        value={aha.header.personInCharge}
        className="min-h-12 w-full rounded-[10px] border-[1.5px] border-input bg-card px-4 py-3 text-base font-medium outline-none transition-shadow focus:border-primary focus:ring-4 focus:ring-secondary"
        onChange={(event) =>
          updateAha((current) =>
            enterCustomPersonInCharge(current, event.target.value),
          )
        }
      />
      <p className="text-sm font-medium leading-relaxed text-muted-foreground">
        This person is responsible for today's work and will be labeled FOREMAN.
        They do not have to be the person entering this AHA.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="outline"
          className="min-h-12 border-[#C6CDE8] px-4 text-base text-primary"
          disabled={aha.crew.length === 0}
          onClick={() => setCrewDialogOpen(true)}
        >
          Choose from today's crew
        </Button>
        {selectedWorker ? (
          <p className="text-sm font-semibold text-primary" role="status">
            {selectedWorker.name} will be labeled FOREMAN.
          </p>
        ) : aha.header.personInCharge.trim() ? (
          <p
            className="text-sm font-medium text-muted-foreground"
            role="status"
          >
            Custom name — no crew member is labeled FOREMAN.
          </p>
        ) : null}
      </div>

      <Dialog open={crewDialogOpen} onOpenChange={setCrewDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Choose person in charge
            </DialogTitle>
            <DialogDescription className="text-base">
              This crew member will be labeled FOREMAN. You can close this
              window and type another name instead.
            </DialogDescription>
          </DialogHeader>
          <div
            className="flex max-h-[min(60vh,480px)] flex-col gap-2 overflow-y-auto pr-1"
          >
            <PersonInChargeCrewChoices
              crew={aha.crew}
              selectedWorkerId={selectedWorkerId}
              onSelect={selectWorker}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-12 text-base"
              onClick={() => setCrewDialogOpen(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
