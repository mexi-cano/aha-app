import { useEffect, useMemo, useState } from "react";
import { MAX_TASKS, canAddTask, createEmptyTask } from "@workspace/aha-domain";

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
import { EditorShell } from "@/components/aha/editor-shell";
import { TextAreaField, TextField } from "@/components/aha/form-field";
import { PrefillBanner } from "@/components/aha/prefill-banner";
import { Button } from "@/components/ui/button";
import { createLocalId } from "@/data/aha-repository";
import { useAhaEditor } from "@/features/aha-editor/editor-context";

export default function AhaWork() {
  const { aha, updateAha } = useAhaEditor();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [limitMessage, setLimitMessage] = useState(false);

  const taskToDelete = useMemo(
    () => aha.tasks.find(({ id }) => id === deleteId) ?? null,
    [aha.tasks, deleteId],
  );

  useEffect(() => {
    if (!editingId) return;
    document.getElementById(`task-${editingId}`)?.focus();
  }, [editingId]);

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
    if (!canAddTask(aha)) {
      setLimitMessage(true);
      return;
    }

    const id = createLocalId();
    updateAha((current) => ({
      ...current,
      tasks: [...current.tasks, createEmptyTask(id)],
    }));
    setLimitMessage(false);
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

  return (
    <EditorShell>
      <div className="flex flex-col gap-5">
        <PrefillBanner />
        <header>
          <h1 className="text-[28px] font-bold">Work</h1>
          <p className="mt-1 text-base font-medium text-muted-foreground">
            Today's tasks, hazards, and controls
          </p>
        </header>

        {aha.tasks.map((task) => {
          const isEditing = editingId === task.id;
          if (!isEditing) {
            return (
              <article
                key={task.id}
                className="rounded-[14px] border border-card-border bg-card p-5 sm:p-6"
              >
                <h2 className="text-lg font-bold">
                  {task.task || "Untitled task"}
                </h2>
                <p className="mt-1 text-base font-medium text-muted-foreground">
                  {task.hazards || "Hazards not entered"}
                </p>
                <p
                  className={`mt-1 text-base font-semibold ${
                    task.controls.trim()
                      ? "text-[#1E8E3E]"
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
                <TextField
                  id={`task-${task.id}`}
                  label="Task"
                  hint="What are you doing?"
                  value={task.task}
                  onChange={(event) =>
                    updateTask(task.id, "task", event.target.value)
                  }
                />
                <TextAreaField
                  id={`hazards-${task.id}`}
                  label="Hazards"
                  hint="What could cause harm?"
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
                    onClick={() => setEditingId(null)}
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
            className="rounded-xl border border-[#E3C27A] bg-[#FBF1DF] px-4 py-3 text-base font-semibold text-[#7A5200]"
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
            rows={4}
            value={aha.meetingNotes}
            onChange={(event) =>
              updateAha((current) => ({
                ...current,
                meetingNotes: event.target.value,
              }))
            }
          />
        </section>
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
    </EditorShell>
  );
}
