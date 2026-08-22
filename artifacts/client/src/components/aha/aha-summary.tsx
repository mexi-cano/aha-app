import type { ReactNode } from "react";
import { Check } from "lucide-react";
import {
  ENERGY_CATEGORY_NAMES,
  resolvePersonInChargeWorkerId,
  type Aha,
  type Job,
  type ReviewIssue,
  type ReviewReport,
} from "@workspace/aha-domain";

import { ReviewIssueGroupNotice } from "@/components/aha/review-issue-notice";
import { ForemanBadge } from "@/components/aha/foreman-badge";
import { EnergyWheel } from "@/components/aha/energy-wheel";
import { Button } from "@/components/ui/button";
import {
  groupReviewIssues,
  type ReviewIssueGroup,
} from "@/features/aha-editor/review-presentation";
import {
  getWorkerReviewCopy,
  workerReviewEnergyCategory,
  workerReviewEnergyExample,
  type WorkerReviewLanguage,
} from "@/features/aha-editor/worker-review-copy";
import { formatLongDate } from "@/lib/date-format";

type EditableSection = "details" | "work" | "energy";

interface AhaSummaryProps {
  aha: Aha;
  job: Job;
  mode: "review" | "signing";
  showCrew?: boolean;
  report?: ReviewReport;
  crewContent?: ReactNode;
  onEdit?: (section: EditableSection) => void;
  onFix?: (issue: ReviewIssue) => void;
  onNotApplicable?: (issue: Extract<ReviewIssue, { tier: "warning" }>) => void;
  disabled?: boolean;
  workerReviewLanguage?: WorkerReviewLanguage;
  showSigningEnergyWheel?: boolean;
}

function SectionHeader({
  label,
  onEdit,
  disabled = false,
}: {
  label: string;
  onEdit?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-4">
      <h2 className="min-w-0 flex-1 text-[13px] font-bold tracking-[0.1em] text-muted-foreground">
        {label}
      </h2>
      {onEdit ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-12 border-[#C6CDE8] px-5 text-base text-primary"
          disabled={disabled}
          onClick={onEdit}
        >
          Edit
        </Button>
      ) : null}
    </div>
  );
}

function SummaryField({
  label,
  value,
  emptyValue,
}: {
  label: string;
  value: string;
  emptyValue: string;
}) {
  const displayValue = value.trim() ? value : emptyValue;
  return (
    <div>
      <dt className="text-sm font-bold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-base font-medium leading-6">
        {displayValue}
      </dd>
    </div>
  );
}

function InformationNotice({
  message,
  positive,
}: {
  message?: string;
  positive: boolean;
}) {
  if (!message) return null;
  return (
    <p
      className={`inline-flex min-h-10 items-center gap-2 self-start rounded-lg px-3.5 text-sm font-bold ${
        positive
          ? "bg-success/10 text-success"
          : "bg-secondary text-secondary-foreground"
      }`}
    >
      {positive ? (
        <Check className="size-4" strokeWidth={3} aria-hidden="true" />
      ) : null}
      {message}
    </p>
  );
}

export function AhaSummary({
  aha,
  job,
  mode,
  showCrew = true,
  report,
  crewContent,
  onEdit,
  onFix,
  onNotApplicable,
  disabled = false,
  workerReviewLanguage = "en",
  showSigningEnergyWheel = false,
}: AhaSummaryProps) {
  const copy = getWorkerReviewCopy(workerReviewLanguage);
  const editable = mode === "review";
  const foremanWorkerId = resolvePersonInChargeWorkerId(aha);
  const issues =
    editable && report
      ? ([...report.mustFix, ...report.warnings] as ReviewIssue[])
      : [];
  const issueGroups = groupReviewIssues(issues);
  const renderIssueGroup = (group: ReviewIssueGroup) =>
    onFix ? (
      <ReviewIssueGroupNotice
        key={group.key}
        group={group}
        onFix={onFix}
        onNotApplicable={onNotApplicable}
        disabled={disabled}
      />
    ) : null;

  const detailsIssueGroups = issueGroups.filter((group) =>
    group.issues.some(({ target }) => target.section === "details"),
  );
  const meetingIssueGroups = issueGroups.filter((group) =>
    group.issues.some(
      ({ target }) =>
        target.section === "work" && target.field === "meetingNotes",
    ),
  );
  const energyIssueGroups = issueGroups.filter((group) =>
    group.issues.some(({ target }) => target.section === "energy"),
  );
  const crewIssueGroups = issueGroups.filter((group) =>
    group.issues.some(({ target }) => target.section === "crew"),
  );
  const workHasBlocker = issues.some(
    (issue) => issue.tier === "must_fix" && issue.target.section === "task",
  );
  const energyHasBlocker = energyIssueGroups.some(
    (group) => group.tier === "must_fix",
  );
  const crewHasBlocker = crewIssueGroups.some(
    (group) => group.tier === "must_fix",
  );

  const optionalValue = (value: string, notApplicable: boolean): string => {
    if (notApplicable) return copy.notApplicable;
    return value.trim() ? value : "";
  };
  const information = (code: ReviewReport["information"][number]["code"]) =>
    report?.information.find((item) => item.code === code)?.message;

  return (
    <div className="flex flex-col gap-[18px]">
      <section className="flex flex-col gap-4 rounded-[14px] border border-card-border bg-card px-5 py-5 sm:px-6">
        <SectionHeader
          label={copy.details}
          onEdit={editable && onEdit ? () => onEdit("details") : undefined}
          disabled={disabled}
        />
        <div>
          <h3 className="text-lg font-bold">
            {job.name} — {job.cityLabel}
          </h3>
          <p className="mt-1 text-base font-medium text-muted-foreground">
            {formatLongDate(aha.date, copy.locale)} · {copy.personInCharge}:{" "}
            {aha.header.personInCharge.trim()
              ? aha.header.personInCharge
              : copy.notEntered}
          </p>
        </div>
        <dl className="grid gap-x-6 gap-y-4 border-t border-border pt-4 sm:grid-cols-2">
          <SummaryField
            label={copy.location}
            value={aha.header.location}
            emptyValue={copy.notEntered}
          />
          <SummaryField
            label={copy.closestEmergencyCentre}
            value={aha.header.closestEmergencyCentre}
            emptyValue={copy.notEntered}
          />
          <SummaryField
            label={copy.emergencyNumber}
            value={aha.header.emergencyNumber}
            emptyValue={copy.notEntered}
          />
          <SummaryField
            label={copy.musterPoint}
            value={aha.header.musterPoint}
            emptyValue={copy.notEntered}
          />
          <SummaryField
            label={copy.rescuePlanRequired}
            value={
              aha.header.rescuePlanRequired === null
                ? copy.notAnswered
                : aha.header.rescuePlanRequired
                  ? copy.yes
                  : copy.no
            }
            emptyValue={copy.notAnswered}
          />
          <SummaryField
            label={copy.workOrderPermit}
            value={optionalValue(
              aha.header.workOrderPermit,
              aha.notApplicable.workOrderPermit,
            )}
            emptyValue={copy.notEntered}
          />
          <SummaryField
            label={copy.jhaProcedureNumbers}
            value={optionalValue(
              aha.header.jhaProcedureNumbers,
              aha.notApplicable.jhaProcedureNumbers,
            )}
            emptyValue={copy.notEntered}
          />
        </dl>
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-bold text-muted-foreground">
            {copy.descriptionOfWork}
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-base font-medium leading-6">
            {aha.description.trim() ? aha.description : copy.notEntered}
          </p>
        </div>
        {detailsIssueGroups.map(renderIssueGroup)}
      </section>

      <section className="flex flex-col gap-4 rounded-[14px] border border-card-border bg-card px-5 py-5 sm:px-6">
        <SectionHeader
          label={copy.workLabel(aha.tasks.length)}
          onEdit={editable && onEdit ? () => onEdit("work") : undefined}
          disabled={disabled}
        />
        <InformationNotice
          message={information("task_count")}
          positive={!workHasBlocker}
        />
        {aha.tasks.map((task) => {
          const taskIssueGroups = issueGroups.filter((group) =>
            group.issues.some(
              ({ target }) =>
                target.section === "task" && target.taskId === task.id,
            ),
          );
          return (
            <article
              key={task.id}
              className="flex flex-col gap-2 border-t border-border pt-4 first:border-t-0 first:pt-0"
            >
              <h3 className="text-lg font-bold">
                {task.task.trim() ? task.task : copy.untitledTask}
              </h3>
              <p className="whitespace-pre-wrap text-base font-medium leading-6">
                <span className="font-bold text-muted-foreground">
                  {copy.hazards}:
                </span>{" "}
                {task.hazards.trim() ? task.hazards : copy.notEntered}
              </p>
              <p className="whitespace-pre-wrap text-base font-medium leading-6">
                <span className="font-bold text-muted-foreground">
                  {copy.controls}:
                </span>{" "}
                {task.controls.trim() ? task.controls : copy.notEntered}
              </p>
              {taskIssueGroups.map(renderIssueGroup)}
            </article>
          );
        })}
        {aha.tasks.length === 0 ? (
          <p className="text-base font-medium text-muted-foreground">
            {copy.noTasks}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-4 rounded-[14px] border border-card-border bg-card px-5 py-5 sm:px-6">
        <SectionHeader
          label={copy.energyLabel(
            aha.energySelections.length,
            ENERGY_CATEGORY_NAMES.length,
          )}
          onEdit={editable && onEdit ? () => onEdit("energy") : undefined}
          disabled={disabled}
        />
        <InformationNotice
          message={information("energy_count")}
          positive={!energyHasBlocker}
        />
        <div
          className={
            showSigningEnergyWheel
              ? "grid gap-5 md:grid-cols-[180px_minmax(0,1fr)] md:items-start"
              : undefined
          }
        >
          {showSigningEnergyWheel ? (
            <EnergyWheel
              presentation="compact"
              selectedCategories={aha.energySelections.map(
                ({ category }) => category,
              )}
              labels={{
                heading: copy.energyWheelHeading,
                selectionSummary: copy.energyWheelSelection(
                  aha.energySelections.length,
                  ENERGY_CATEGORY_NAMES.length,
                ),
                helper: copy.energyWheelHelper,
                accessibilityDescription: copy.energyWheelAccessibility(
                  aha.energySelections.length,
                  ENERGY_CATEGORY_NAMES.length,
                ),
              }}
            />
          ) : null}
          <div className="flex min-w-0 flex-col gap-3">
            {aha.energySelections.map(({ category, examples }) => (
              <div
                key={category}
                className="flex flex-col items-start gap-2 sm:flex-row sm:items-center"
              >
                <span className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-[#C6CDE8] bg-secondary px-3.5 text-[15px] font-semibold text-secondary-foreground">
                  {workerReviewEnergyCategory(category, workerReviewLanguage)}
                </span>
                <span
                  className={`min-w-0 text-base font-medium ${
                    examples.length ? "" : "text-muted-foreground"
                  }`}
                >
                  {examples.length
                    ? examples
                        .map((example) =>
                          workerReviewEnergyExample(
                            example,
                            workerReviewLanguage,
                          ),
                        )
                        .join(", ")
                    : copy.noExamples}
                </span>
              </div>
            ))}
            {aha.energySelections.length === 0 ? (
              <p className="text-base font-medium text-muted-foreground">
                {copy.noEnergy}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4 text-base font-semibold">
          {copy.safetyCheck}:{" "}
          {aha.safetyCheck === "yes" ? (
            <span className="inline-flex items-center gap-1 text-success">
              {copy.yes}{" "}
              <Check className="size-5" strokeWidth={3} aria-hidden="true" />
            </span>
          ) : aha.safetyCheck === "no" ? (
            <span>{copy.no}</span>
          ) : (
            <span className="text-muted-foreground">{copy.notAnswered}</span>
          )}
        </div>
        {energyIssueGroups.map(renderIssueGroup)}
      </section>

      <section className="flex flex-col gap-4 rounded-[14px] border border-card-border bg-card px-5 py-5 sm:px-6">
        <SectionHeader
          label={copy.meetingNotes}
          onEdit={editable && onEdit ? () => onEdit("work") : undefined}
          disabled={disabled}
        />
        <p className="whitespace-pre-wrap text-base font-medium leading-6">
          {optionalValue(aha.meetingNotes, aha.notApplicable.meetingNotes) ||
            copy.notEntered}
        </p>
        {meetingIssueGroups.map(renderIssueGroup)}
      </section>

      {showCrew ? (
        <section className="flex flex-col gap-4 rounded-[14px] border border-card-border bg-card px-5 py-5 sm:px-6">
          {crewContent ?? (
            <div className="flex flex-col gap-3">
              <SectionHeader label={`TODAY'S CREW — ${aha.crew.length}`} />
              <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {aha.crew.map((member) => (
                  <div
                    key={member.workerId}
                    className="flex min-h-8 items-center gap-2 text-base font-medium"
                  >
                    {member.name}
                    {member.workerId === foremanWorkerId ? (
                      <ForemanBadge />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
          <InformationNotice
            message={information("crew_count")}
            positive={!crewHasBlocker}
          />
          {crewIssueGroups.map(renderIssueGroup)}
        </section>
      ) : null}
    </div>
  );
}
