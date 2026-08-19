import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import {
  MAX_CREW_MEMBERS,
  addCrewMember,
  removeCrewMember,
  renameCrewMember,
  resolvePersonInChargeWorkerId,
  type Aha,
  type Job,
  type JobWorker,
} from "@workspace/aha-domain";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ForemanBadge } from "@/components/aha/foreman-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createLocalId } from "@/data/aha-repository";
import { scrollToAndFocus } from "@/features/aha-editor/editor-navigation";
import { cn } from "@/lib/utils";

interface CrewEditorProps {
  aha: Aha;
  job: Job;
  updateAha: (update: (current: Aha) => Aha) => void;
  commitAha: (update: (current: Aha) => Aha) => Promise<Aha | null>;
  focusCrew?: boolean;
  disabled?: boolean;
}

export function CrewEditor({
  aha,
  job,
  updateAha,
  commitAha,
  focusCrew = false,
  disabled = false,
}: CrewEditorProps) {
  const [editing, setEditing] = useState(false);
  const [pendingRemovalId, setPendingRemovalId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addWorkerId, setAddWorkerId] = useState(() => createLocalId());
  const [limitMessage, setLimitMessage] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);

  const candidates = useMemo(() => {
    const workers = new Map<string, JobWorker>();
    for (const worker of job.roster) workers.set(worker.id, worker);
    for (const member of aha.crew) {
      workers.set(member.workerId, {
        id: member.workerId,
        name: member.name,
      });
    }
    return [...workers.values()];
  }, [aha.crew, job.roster]);

  const pendingRemoval = aha.crew.find(
    ({ workerId }) => workerId === pendingRemovalId,
  );
  const renameMember = aha.crew.find(({ workerId }) => workerId === renameId);
  const foremanWorkerId = resolvePersonInChargeWorkerId(aha);

  useEffect(() => {
    if (focusCrew) setEditing(true);
  }, [focusCrew]);

  useEffect(() => {
    if (focusCrew && editing) scrollToAndFocus("add-crew-worker");
  }, [editing, focusCrew]);

  const toggleWorker = (worker: JobWorker) => {
    setOperationError(null);
    const current = aha.crew.find(({ workerId }) => workerId === worker.id);
    if (!current) {
      try {
        updateAha((value) => addCrewMember(value, worker));
        setLimitMessage(false);
      } catch {
        setLimitMessage(true);
      }
      return;
    }

    if (current.signaturePng) {
      setPendingRemovalId(current.workerId);
      return;
    }
    updateAha((value) => removeCrewMember(value, current.workerId));
  };

  const confirmSignedRemoval = async () => {
    if (!pendingRemovalId || isCommitting) return;
    setIsCommitting(true);
    setOperationError(null);
    const saved = await commitAha((current) =>
      removeCrewMember(current, pendingRemovalId),
    );
    setIsCommitting(false);
    if (saved) {
      setPendingRemovalId(null);
    } else {
      setOperationError(
        "We couldn't remove this crew member. The saved AHA has not changed. Try again.",
      );
    }
  };

  const openRename = (workerId: string, name: string) => {
    setRenameId(workerId);
    setRenameValue(name);
    setOperationError(null);
  };

  const submitRename = async () => {
    if (!renameId || !renameValue.trim() || isCommitting) return;
    setOperationError(null);
    if (renameMember?.signaturePng) {
      setIsCommitting(true);
      const saved = await commitAha((current) =>
        renameCrewMember(current, renameId, renameValue),
      );
      setIsCommitting(false);
      if (!saved) {
        setOperationError(
          "We couldn't rename this crew member. The saved signature is unchanged. Try again.",
        );
        return;
      }
    } else {
      updateAha((current) => renameCrewMember(current, renameId, renameValue));
    }
    setRenameId(null);
    setRenameValue("");
  };

  const openAddWorker = () => {
    if (aha.crew.length >= MAX_CREW_MEMBERS) {
      setLimitMessage(true);
      return;
    }
    setLimitMessage(false);
    setAddName("");
    setAddWorkerId(createLocalId());
    setAddOpen(true);
  };

  const submitAddWorker = () => {
    const name = addName.trim();
    if (!name) return;
    try {
      updateAha((current) => addCrewMember(current, { id: addWorkerId, name }));
      setAddOpen(false);
      setAddName("");
      setLimitMessage(false);
    } catch {
      setAddOpen(false);
      setLimitMessage(true);
    }
  };

  if (!editing) {
    return (
      <div id="crew-card" className="flex flex-col gap-3.5">
        <div className="flex items-center gap-4">
          <p className="min-w-0 flex-1 text-[13px] font-bold tracking-[0.1em] text-muted-foreground">
            TODAY'S CREW — {aha.crew.length}
          </p>
          <Button
            id="edit-crew"
            type="button"
            variant="outline"
            className="min-h-12 border-[#C6CDE8] px-5 text-base text-primary"
            disabled={disabled}
            onClick={() => setEditing(true)}
          >
            Edit Crew
          </Button>
        </div>
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {aha.crew.map((member) => (
            <div
              key={member.workerId}
              className="flex min-h-10 items-center gap-2 text-base font-medium"
            >
              {member.name}
              {member.workerId === foremanWorkerId ? <ForemanBadge /> : null}
            </div>
          ))}
          {aha.crew.length === 0 ? (
            <p className="text-base font-medium text-muted-foreground">
              No crew members selected.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div id="crew-card" className="flex flex-col gap-3.5">
      <div className="flex items-center gap-4">
        <p className="min-w-0 flex-1 text-[13px] font-bold tracking-[0.1em] text-muted-foreground">
          TODAY'S CREW — {aha.crew.length}
        </p>
        <Button
          type="button"
          className="min-h-12 px-6 text-base"
          disabled={disabled || isCommitting}
          onClick={() => setEditing(false)}
        >
          Done
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {candidates.map((worker) => {
          const selected = aha.crew.find(
            ({ workerId }) => workerId === worker.id,
          );
          return (
            <div
              key={worker.id}
              className={cn(
                "flex min-h-12 items-stretch overflow-hidden rounded-[10px] border-[1.5px]",
                selected
                  ? "border-primary bg-secondary"
                  : "border-border bg-card",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                role="checkbox"
                aria-checked={Boolean(selected)}
                disabled={disabled || isCommitting}
                onClick={() => toggleWorker(worker)}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md border-2",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-[#8A93AC] bg-card text-transparent",
                  )}
                  aria-hidden="true"
                >
                  <Check className="size-4" strokeWidth={3} />
                </span>
                <span className="truncate text-base font-semibold">
                  {selected?.name ?? worker.name}
                </span>
              </button>
              {selected ? (
                <button
                  type="button"
                  className="min-h-12 shrink-0 border-l border-[#C6CDE8] px-3 text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  disabled={disabled || isCommitting}
                  onClick={() => openRename(selected.workerId, selected.name)}
                >
                  Rename
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <Button
        id="add-crew-worker"
        type="button"
        variant="outline"
        className="min-h-14 w-full border-[1.5px] border-dashed border-[#C6CDE8] text-base text-primary"
        disabled={disabled || isCommitting}
        onClick={openAddWorker}
      >
        + Add worker
      </Button>
      <p className="text-sm font-medium text-muted-foreground">
        From the job roster — check everyone on site today
      </p>
      {limitMessage ? (
        <p
          className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-base font-semibold text-warning-foreground"
          role="status"
        >
          This won't fit on the ITS sheet. Remove an absent worker before adding
          someone else.
        </p>
      ) : null}

      <AlertDialog
        open={pendingRemovalId !== null}
        onOpenChange={(open) => {
          if (!open && !isCommitting) {
            setPendingRemovalId(null);
            setOperationError(null);
          }
        }}
      >
        <AlertDialogContent className="max-w-md rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              Remove {pendingRemoval?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base font-medium">
              This worker has already signed. Removing them also deletes their
              signature. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {operationError ? (
            <p
              className="text-base font-semibold text-warning-foreground"
              role="alert"
            >
              {operationError}
            </p>
          ) : null}
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel
              className="min-h-12 text-base"
              disabled={disabled || isCommitting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-12 bg-foreground px-6 text-base text-background"
              disabled={disabled || isCommitting}
              onClick={(event) => {
                event.preventDefault();
                void confirmSignedRemoval();
              }}
            >
              {isCommitting ? "Removing…" : "Remove & delete signature"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={renameId !== null}
        onOpenChange={(open) => {
          if (!open && !isCommitting) {
            setRenameId(null);
            setOperationError(null);
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl">Rename crew member</DialogTitle>
            <DialogDescription className="text-base">
              {renameMember?.signaturePng
                ? "This worker has already signed. Renaming them clears that signature so it is never reassigned silently."
                : "This name changes only on today's AHA."}
            </DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-2 text-base font-bold">
            Worker name
            <Input
              value={renameValue}
              className="min-h-12 text-base"
              autoComplete="name"
              onChange={(event) => setRenameValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submitRename();
              }}
            />
          </label>
          {operationError ? (
            <p
              className="text-base font-semibold text-warning-foreground"
              role="alert"
            >
              {operationError}
            </p>
          ) : null}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-12 text-base"
              disabled={disabled || isCommitting}
              onClick={() => setRenameId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="min-h-12 text-base"
              disabled={!renameValue.trim() || disabled || isCommitting}
              onClick={() => void submitRename()}
            >
              {isCommitting
                ? "Saving…"
                : renameMember?.signaturePng
                  ? "Rename & clear signature"
                  : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md rounded-2xl bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl">Add worker</DialogTitle>
            <DialogDescription className="text-base">
              This worker joins today's crew only.
            </DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-2 text-base font-bold">
            Worker name
            <Input
              autoFocus
              value={addName}
              className="min-h-12 text-base"
              disabled={disabled}
              placeholder="First and last name"
              autoComplete="name"
              onChange={(event) => setAddName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitAddWorker();
              }}
            />
          </label>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-12 text-base"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="min-h-12 text-base"
              disabled={!addName.trim() || disabled}
              onClick={submitAddWorker}
            >
              Add to today's crew
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
