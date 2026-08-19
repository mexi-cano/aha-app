import itsLogo from "../../../../../assets/design/uploads/its-logo.png";

export function AppLogo() {
  return (
    <div className="h-10 w-40 overflow-hidden" aria-label="ITS">
      <img
        src={itsLogo}
        alt="ITS — Infrastructure Technology Services"
        className="-mt-3 h-[64px] w-auto max-w-none mix-blend-multiply"
      />
    </div>
  );
}
