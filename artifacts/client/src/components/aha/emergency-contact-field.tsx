import * as React from "react";
import {
  classifyEmergencyContact,
  normalizeStandaloneEmergencyContact,
} from "@workspace/aha-domain";

import { TextField } from "@/components/aha/form-field";

const EMERGENCY_CONTACT_WARNING =
  "Check that this includes the number the crew should call.";

export function emergencyContactValueAfterBlur(
  value: string,
  editedSinceFocus: boolean,
): string {
  return editedSinceFocus ? normalizeStandaloneEmergencyContact(value) : value;
}

export function EmergencyContactField({
  id,
  value,
  onValueChange,
  description,
  invalid = false,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  description?: string;
  invalid?: boolean;
}) {
  const editedSinceFocus = React.useRef(false);
  const [hasBlurred, setHasBlurred] = React.useState(false);
  const showWarning =
    hasBlurred && classifyEmergencyContact(value) === "unrecognized";

  return (
    <TextField
      id={id}
      label="Emergency number"
      description={description}
      feedback={
        showWarning
          ? { tone: "warning", message: EMERGENCY_CONTACT_WARNING }
          : undefined
      }
      requirement="required"
      inputMode="tel"
      autoComplete="off"
      value={value}
      aria-invalid={invalid}
      onFocus={() => {
        editedSinceFocus.current = false;
      }}
      onChange={(event) => {
        editedSinceFocus.current = true;
        onValueChange(event.target.value);
      }}
      onBlur={() => {
        const normalized = emergencyContactValueAfterBlur(
          value,
          editedSinceFocus.current,
        );
        editedSinceFocus.current = false;
        setHasBlurred(true);
        if (normalized !== value) onValueChange(normalized);
      }}
    />
  );
}
