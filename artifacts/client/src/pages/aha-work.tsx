import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import {
  ENERGY_CATEGORIES,
  MAX_TASKS,
  canAddTask,
  createEmptyTask,
  getReviewReport,
  toggleEnergyCategory,
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
import { EditorContinue } from "@/components/aha/editor-continue";
import { EditorShell } from "@/components/aha/editor-shell";
import { EnergyCategoryToggle } from "@/components/aha/energy-category-toggle";
import { TextAreaField } from "@/components/aha/form-field";
import { PrefillBanner } from "@/components/aha/prefill-banner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createLocalId } from "@/data/aha-repository";
import { useAhaEditor } from "@/features/aha-editor/editor-context";
import { shouldShowPrefillBanner } from "@/features/aha-editor/completed-update-grouping";
import { scrollToAndFocus } from "@/features/aha-editor/editor-navigation";
import { taskNeedsDetails } from "@/features/aha-editor/review-presentation";
import { runAhaPdfFitPreflight } from "@/features/aha-editor/pdf-fit-preflight";
import type { PdfFitIssue } from "@/pdf";

export default function AhaWork() {
  const { aha, job, updateAha, navigateSafely, editorBasePath, editorMode } =
    useAhaEditor();
  const [searchParams] = useSearchParams();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [limitMessage, setLimitMessage] = useState(false);
  const [energyDialogOpen, setEnergyDialogOpen] = useState(false);
  const [taskFitIssues, setTaskFitIssues] = useState<
    Record<string, PdfFitIssue[]>
  >({});
  const [fitCheckFailedTaskId, setFitCheckFailedTaskId] = useState<
    string | null
  >(null);

  const taskToDelete = useMemo(
    () => aha.tasks.find(({ id }) => id === deleteId) ?? null,
    [aha.tasks, deleteId],
  );
  const reviewReport = useMemo(() => getReviewReport(aha), [aha]);

  useEffect(() => {
    const requestedTaskId = searchParams.get("task");
    if (requestedTaskId && aha.tasks.some(({ id }) => id === requestedTaskId)) {
      setEditingId(requestedTaskId);
      return;
    }

    const focus = searchParams.get("focus");
    if (focus) scrollToAndFocus(focus);
  }, [aha.tasks, searchParams]);

  useEffect(() => {
    if (!editingId) return;
    const requestedField = searchParams.get("field");
    const field = ["task", "hazards", "controls"].includes(requestedField ?? "")
      ? requestedField
      : "task";
    scrollToAndFocus(`${field}-${editingId}`);
  }, [editingId, searchParams]);

  const updateTask = (
    id: string,
    field: "task" | "hazards" | "controls",
    value: string,
  ) => {
    updateAha((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id ? { ...task, [field]: value } : task,
      ),
    }));
  };

  const addTask = () => {
    const id = createLocalId();
    let rejected = false;
    updateAha((current) => {
      if (!canAddTask(current)) {
        rejected = true;
        return current;
      }
      return {
        ...current,
        tasks: [...current.tasks, createEmptyTask(id)],
      };
    });
    setLimitMessage(rejected);
    if (rejected) return;
    setEditingId(id);
  };

  const deleteTask = () => {
    if (!deleteId) return;
    updateAha((current) => ({
      ...current,
      tasks: current.tasks.filter(({ id }) => id !== deleteId),
    }));
    if (editingId === deleteId) setEditingId(null);
    setDeleteId(null);
    setLimitMessage(false);
  };

  const finishEditingTask = async (taskId: string) => {
    setEditingId(null);
    setFitCheckFailedTaskId(null);
    try {
      const fit = await runAhaPdfFitPreflight(aha, job);
      setTaskFitIssues((current) => ({
        ...current,
        [taskId]: fit.issues.filter((issue) => issue.taskId === taskId),
      }));
    } catch {
      setFitCheckFailedTaskId(taskId);
    }
  };

  return (
    <EditorShell>
      <div className="flex flex-col gap-5">
        {shouldShowPrefillBanner(editorMode) ? <PrefillBanner /> : null}
        <header>
          <h1 className="text-[28px] font-bold">Work</h1>
          <p className="mt-1 text-base font-medium text-muted-foreground">
            Today's tasks, hazards, and controls
          </p>
        </header>

        {aha.tasks.map((task) => {
          const isEditing = editingId === task.id;
          const needsDetails = taskNeedsDetails(reviewReport, task.id);
          const officialSheetIssues = taskFitIssues[task.id] ?? [];
          if (!isEditing) {
            return (
              <article
                key={task.id}
                className="rounded-[14px] border border-card-border bg-card p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="min-w-0 text-lg font-bold">
                    {task.task.trim() ? task.task : "Untitled task"}
                  </h2>
                  {needsDetails ? (
                    <span className="inline-flex min-h-7 shrink-0 items-center rounded-full border border-[#C6CDE8] bg-secondary px-3 text-xs font-bold text-secondary-foreground">
                      Needs details
                    </span>
                  ) : null}
                </div>
                {officialSheetIssues.length > 0 ? (
                  <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-semibold text-warning-foreground">
                    Won&apos;t fit official sheet. Shorten this task or split
                    the work before signing.
                  </p>
                ) : null}
                {fitCheckFailedTaskId === task.id ? (
                  <p className="mt-3 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-semibold text-warning-foreground">
                    Official-sheet fit could not be checked. Review will try
                    again before signing.
                  </p>
                ) : null}
                <p className="mt-1 text-base font-medium text-muted-foreground">
                  {task.hazards.trim() ? task.hazards : "Hazards not entered"}
                </p>
                <p
                  className={`mt-1 text-base font-semibold ${
                    task.controls.trim()
                      ? "text-success"
                      : "text-muted-foreground"
                  }`}
                >
                  {task.controls.trim()
                    ? "✓ Controls entered"
                    : "Controls not entered"}
                </p>
                <div className="mt-4 flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 flex-1 border-[#C6CDE8] text-base text-primary"
                    onClick={() => setEditingId(task.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 px-5 text-base text-muted-foreground"
                    onClick={() => setDeleteId(task.id)}
                  >
                    Delete
                  </Button>
                </div>
              </article>
            );
          }

          return (
            <article
              key={task.id}
              className="rounded-[14px] border border-primary bg-card p-5 shadow-[inset_0_0_0_1px_#374B96] sm:p-6"
            >
              <div className="flex flex-col gap-5">
                <TextAreaField
                  id={`task-${task.id}`}
                  label="Task"
                  hint="What are you doing?"
                  requirement="required"
                  rows={2}
                  autoGrow
                  description={
                    <>
                      Describe the work only. Select Energy Wheel categories
                      separately. Example: Cut asphalt.
                    </>
                  }
                  value={task.task}
                  onChange={(event) =>
                    updateTask(task.id, "task", event.target.value)
                  }
                />
                <div className="rounded-xl border border-[#C6CDE8] bg-secondary/60 p-4">
                  <p className="text-sm font-semibold text-secondary-foreground">
                    Energy selections apply to today&apos;s entire AHA, not only
                    this task.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 min-h-12 w-full border-[#C6CDE8] bg-card text-base font-bold text-primary sm:w-auto"
                    onClick={() => setEnergyDialogOpen(true)}
                  >
                    Mark today&apos;s energy
                  </Button>
                </div>
                <TextAreaField
                  id={`hazards-${task.id}`}
                  label="Hazards"
                  hint="What could cause harm?"
                  requirement="required"
                  rows={3}
                  value={task.hazards}
                  onChange={(event) =>
                    updateTask(task.id, "hazards", event.target.value)
                  }
                />
                <TextAreaField
                  id={`controls-${task.id}`}
                  label="Controls"
                  hint="How are you controlling it?"
                  requirement="required"
                  rows={4}
                  value={task.controls}
                  onChange={(event) =>
                    updateTask(task.id, "controls", event.target.value)
                  }
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-12 px-5 text-base text-muted-foreground"
                    onClick={() => setDeleteId(task.id)}
                  >
                    Delete
                  </Button>
                  <Button
                    type="button"
                    className="min-h-12 flex-1 text-base font-bold"
                    onClick={() => void finishEditingTask(task.id)}
                  >
                    Done
                  </Button>
                </div>
              </div>
            </article>
          );
        })}

        <button
          type="button"
          className="min-h-14 w-full rounded-xl border-[1.5px] border-dashed border-[#C6CDE8] bg-card px-4 text-base font-bold text-primary outline-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          onClick={addTask}
          aria-describedby={limitMessage ? "task-limit-message" : undefined}
        >
          + Add Task
        </button>
        {limitMessage ? (
          <p
            id="task-limit-message"
            className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-base font-semibold text-warning-foreground"
            role="status"
          >
            This AHA can include up to {MAX_TASKS} tasks. Split the work into
            another AHA if needed.
          </p>
        ) : null}

        <section className="rounded-[14px] border border-card-border bg-card p-5 sm:p-6">
          <TextAreaField
            id="meeting-notes"
            label="On-site meeting notes"
            hint="Anything discussed at the on-site meeting"
            requirement="optional"
            rows={4}
            value={aha.meetingNotes}
            onChange={(event) =>
              updateAha((current) => ({
                ...current,
                meetingNotes: event.target.value,
                notApplicable: event.target.value.trim()
                  ? { ...current.notApplicable, meetingNotes: false }
                  : current.notApplicable,
              }))
            }
          />
        </section>

        <EditorContinue
          next="3 Energy"
          onContinue={() => void navigateSafely(`${editorBasePath}/energy`)}
        />
      </div>

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent className="max-w-md rounded-2xl bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">
              Delete{" "}
              {taskToDelete?.task ? `“${taskToDelete.task}”` : "this task"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base font-medium">
              This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="min-h-12 text-base">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-12 bg-foreground px-6 text-base text-background"
              onClick={deleteTask}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={energyDialogOpen} onOpenChange={setEnergyDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-2xl bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Mark today&apos;s energy
            </DialogTitle>
            <DialogDescription className="text-base font-medium leading-relaxed">
              These categories apply to today&apos;s entire AHA. Step 3 still
              asks you to review the full wheel, choose examples, and answer the
              safety check.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm font-semibold text-muted-foreground">
            {aha.energySelections.length} of {ENERGY_CATEGORIES.length} selected
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {ENERGY_CATEGORIES.map(({ category }) => {
              const selected = aha.energySelections.some(
                (selection) => selection.category === category,
              );
              return (
                <div
                  key={category}
                  className={`rounded-xl border-2 ${
                    selected
                      ? "border-primary bg-secondary"
                      : "border-border bg-card"
                  }`}
                >
                  <EnergyCategoryToggle
                    category={category}
                    selected={selected}
                    onToggle={() =>
                      updateAha((current) =>
                        toggleEnergyCategory(current, category),
                      )
                    }
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              type="button"
              className="min-h-12 w-full text-base font-bold sm:w-auto"
              onClick={() => setEnergyDialogOpen(false)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </EditorShell>
  );
}
