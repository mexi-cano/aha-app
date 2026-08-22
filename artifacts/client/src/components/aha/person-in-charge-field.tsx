import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import {
  enterCustomPersonInCharge,
  findUniqueWorkerIdByName,
  resolvePersonInChargeWorkerId,
  selectPersonInChargeWorker,
  type Aha,
} from "@workspace/aha-domain";

import { FieldRequirementBadge } from "@/components/aha/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const normalizedNameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    crew.forEach(({ name }) => {
      const key = name.trim().toLocaleLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [crew]);
  const duplicatePositions = new Map<string, number>();

  return crew.map((member) => {
    const selected = member.workerId === selectedWorkerId;
    const normalizedName = member.name.trim().toLocaleLowerCase();
    const duplicateCount = normalizedNameCounts.get(normalizedName) ?? 1;
    const duplicatePosition = (duplicatePositions.get(normalizedName) ?? 0) + 1;
    duplicatePositions.set(normalizedName, duplicatePosition);
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
        <span className="min-w-0 flex-1">{member.name}</span>
        {duplicateCount > 1 ? (
          <span className="shrink-0 text-sm font-medium text-muted-foreground">
            {duplicatePosition} of {duplicateCount}
          </span>
        ) : null}
        <ChevronRight
          className="size-5 shrink-0 text-primary"
          aria-hidden="true"
        />
      </button>
    );
  });
}

export function PersonInChargeField({
  aha,
  updateAha,
}: PersonInChargeFieldProps) {
  const [crewDialogOpen, setCrewDialogOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState("");
  const selectedWorkerId = resolvePersonInChargeWorkerId(aha);
  const selectedWorker = aha.crew.find(
    ({ workerId }) => workerId === selectedWorkerId,
  );

  const selectWorker = (workerId: string) => {
    updateAha((current) => selectPersonInChargeWorker(current, workerId));
    setCrewDialogOpen(false);
  };

  useEffect(() => {
    if (!crewDialogOpen) {
      setCustomMode(false);
      setCustomName("");
    }
  }, [crewDialogOpen]);

  const saveCustomName = () => {
    if (!customName.trim()) return;
    updateAha((current) =>
      enterCustomPersonInCharge(current, customName.trim()),
    );
    setCrewDialogOpen(false);
  };

  const currentName = aha.header.personInCharge.trim();
  const matchingWorkerId = selectedWorkerId
    ? null
    : findUniqueWorkerIdByName(
        aha.crew.map(({ workerId, name }) => ({ id: workerId, name })),
        currentName,
      );
  const matchingWorker = aha.crew.find(
    ({ workerId }) => workerId === matchingWorkerId,
  );
  const stateDescription = selectedWorker
    ? "FOREMAN · Today’s crew"
    : currentName
      ? "Not in today’s signing crew"
      : null;

  return (
    <div className="flex flex-col gap-2 sm:col-span-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-bold">
        <span>Person in charge</span>
        <FieldRequirementBadge requirement="required" />
      </div>
      <div
        className="flex min-h-[76px] items-center gap-3 rounded-[10px] border-[1.5px] border-input bg-card px-4 py-3"
        aria-required="true"
      >
        <div className="min-w-0 flex-1">
          <p
            className={`text-base font-semibold ${
              currentName ? "" : "text-muted-foreground"
            }`}
          >
            {currentName || "Choose person in charge"}
          </p>
          {stateDescription ? (
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              {stateDescription}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-12 shrink-0 border-[#C6CDE8] px-4 text-base text-primary"
          onClick={() => setCrewDialogOpen(true)}
        >
          {currentName ? "Change" : "Choose"}
        </Button>
      </div>
      <p className="text-sm font-medium leading-relaxed text-muted-foreground">
        This person is responsible for today’s work and will be labeled FOREMAN.
        They do not have to be the person entering this AHA.
      </p>
      {matchingWorker ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-12 w-full border-[#C6CDE8] text-left text-sm font-bold text-primary sm:w-auto"
          onClick={() => selectWorker(matchingWorker.workerId)}
        >
          Connect to {matchingWorker.name} in today&apos;s crew
        </Button>
      ) : null}

      <Dialog open={crewDialogOpen} onOpenChange={setCrewDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Choose person in charge
            </DialogTitle>
            <DialogDescription className="text-base">
              Choose a worker from today’s crew or enter someone else. The
              selected person will be labeled FOREMAN when they are in the crew.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[min(60vh,520px)] flex-col gap-4 overflow-y-auto pr-1">
            {aha.crew.length > 0 ? (
              <section
                className="flex flex-col gap-2"
                aria-labelledby="today-crew-heading"
              >
                <h3
                  id="today-crew-heading"
                  className="text-sm font-bold tracking-[0.08em] text-muted-foreground"
                >
                  TODAY’S CREW
                </h3>
                <PersonInChargeCrewChoices
                  crew={aha.crew}
                  selectedWorkerId={selectedWorkerId}
                  onSelect={selectWorker}
                />
              </section>
            ) : (
              <p className="rounded-xl bg-secondary px-4 py-3 text-sm font-medium leading-relaxed text-secondary-foreground">
                Today’s crew is empty. You can enter someone else now and add
                signing crew members at Review.
              </p>
            )}

            <section className="flex flex-col gap-2 border-t border-border pt-4">
              {!customMode ? (
                <button
                  type="button"
                  className="flex min-h-12 items-center justify-between rounded-[10px] border-[1.5px] border-border bg-card px-4 text-left text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => {
                    setCustomName(selectedWorker ? "" : currentName);
                    setCustomMode(true);
                  }}
                >
                  Someone else
                  <ChevronRight
                    className="size-5 text-primary"
                    aria-hidden="true"
                  />
                </button>
              ) : (
                <label className="flex flex-col gap-2 text-base font-bold">
                  <span>Person in charge</span>
                  <Input
                    autoFocus
                    required
                    value={customName}
                    className="min-h-12 text-base"
                    placeholder="First and last name"
                    onChange={(event) => setCustomName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        saveCustomName();
                      }
                    }}
                  />
                  <span className="text-sm font-medium text-muted-foreground">
                    This person is not added to today’s signing crew.
                  </span>
                </label>
              )}
            </section>
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
            {customMode ? (
              <Button
                type="button"
                className="min-h-12 text-base"
                disabled={!customName.trim()}
                onClick={saveCustomName}
              >
                Save person in charge
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
