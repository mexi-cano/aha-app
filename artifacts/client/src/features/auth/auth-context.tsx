import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ApiError,
  authenticate,
  setAuthTokenGetter,
  setUnauthorizedHandler,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getStoredAuthToken,
  hasAuthorizedBefore,
  storeAuthorization,
} from "@/data/auth-storage";
import { ahaDatabase } from "@/data/database";
import { hasConfiguredJob } from "@/data/job-repository";
import { AUTHORIZATION_REQUIRED_EVENT } from "@/data/restore";

export const BACKUP_AUTH_PAUSED_SETTING = "backupPausedForAuth";
export const AUTHORIZATION_CHANGED_EVENT = "aha-authorization-changed";

interface AuthContextValue {
  isAuthorizedForNetwork: boolean;
  requireAuthorization: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthorization(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Authorization context is unavailable.");
  return value;
}

function signalAuthorizationChanged(): void {
  window.dispatchEvent(new Event(AUTHORIZATION_CHANGED_EVENT));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [canUseOffline, setCanUseOffline] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAuthorizedForNetwork, setIsAuthorizedForNetwork] = useState(false);

  const requireAuthorization = useCallback(() => {
    setIsAuthorizedForNetwork(false);
    setIsLocked(true);
    void ahaDatabase.settings.put({
      key: BACKUP_AUTH_PAUSED_SETTING,
      value: "true",
    });
    signalAuthorizationChanged();
  }, []);

  useEffect(() => {
    setAuthTokenGetter(getStoredAuthToken);
    setUnauthorizedHandler(requireAuthorization);
    let cancelled = false;
    void Promise.all([
      getStoredAuthToken(),
      hasConfiguredJob(),
      hasAuthorizedBefore(),
      ahaDatabase.settings.get(BACKUP_AUTH_PAUSED_SETTING),
    ]).then(async ([token, configured, authorizedBefore, paused]) => {
      if (cancelled) return;
      setCanUseOffline(configured || authorizedBefore);
      setIsAuthorizedForNetwork(Boolean(token) && !paused);
      setIsLocked(!token || Boolean(paused));
      if (!token && !paused) {
        await ahaDatabase.settings.put({
          key: BACKUP_AUTH_PAUSED_SETTING,
          value: "true",
        });
        signalAuthorizationChanged();
      }
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
      setAuthTokenGetter(null);
    };
  }, [requireAuthorization]);

  useEffect(() => {
    window.addEventListener(AUTHORIZATION_REQUIRED_EVENT, requireAuthorization);
    return () =>
      window.removeEventListener(
        AUTHORIZATION_REQUIRED_EVENT,
        requireAuthorization,
      );
  }, [requireAuthorization]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const authorization = await authenticate({ accessCode });
      await storeAuthorization(authorization.token, authorization.expiresAt);
      await ahaDatabase.settings.delete(BACKUP_AUTH_PAUSED_SETTING);
      setAccessCode("");
      setCanUseOffline(true);
      setIsAuthorizedForNetwork(true);
      setIsLocked(false);
      signalAuthorizationChanged();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setError("That access code didn't work. Try again.");
      } else if (caught instanceof ApiError && caught.status === 429) {
        setError("Too many attempts. Wait a minute, then try again.");
      } else {
        setError(
          navigator.onLine
            ? "The access check is unavailable. Try again. Saved work is unaffected."
            : "Connect to the internet to check the access code.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const context = useMemo(
    () => ({ isAuthorizedForNetwork, requireAuthorization }),
    [isAuthorizedForNetwork, requireAuthorization],
  );

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background px-5 py-12">
        <p className="text-center text-base font-semibold text-muted-foreground">
          Opening secure access…
        </p>
      </main>
    );
  }

  return (
    <AuthContext.Provider value={context}>
      {children}
      {isLocked ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 px-5 py-8 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="access-code-title"
        >
          <form
            className="w-full max-w-md rounded-2xl border border-card-border bg-card p-7 shadow-xl"
            onSubmit={(event) => void submit(event)}
          >
            <p className="text-sm font-bold tracking-[0.1em] text-muted-foreground">
              SECURE BACKUP
            </p>
            <h1 id="access-code-title" className="mt-2 text-2xl font-bold">
              Enter your crew's access code
            </h1>
            <p className="mt-3 text-base font-medium leading-relaxed text-muted-foreground">
              The code authorizes backup and empty-iPad recovery. Work already
              saved on this iPad remains available offline.
            </p>
            <label
              className="mt-6 block text-base font-bold"
              htmlFor="access-code"
            >
              Access code
            </label>
            <Input
              id="access-code"
              type="password"
              autoComplete="current-password"
              autoFocus
              className="mt-2 min-h-12 text-base"
              maxLength={128}
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
            />
            {error ? (
              <p
                className="mt-3 text-base font-semibold text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <Button
              type="submit"
              className="mt-5 min-h-14 w-full text-base font-bold"
              disabled={!accessCode || isSubmitting}
            >
              {isSubmitting ? "CHECKING…" : "CONTINUE"}
            </Button>
            {canUseOffline ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-3 min-h-12 w-full text-base text-primary"
                onClick={() => setIsLocked(false)}
              >
                Use saved work offline
              </Button>
            ) : (
              <p className="mt-4 text-center text-sm font-semibold text-muted-foreground">
                A new iPad must be online for its first authorization.
              </p>
            )}
          </form>
        </div>
      ) : null}
    </AuthContext.Provider>
  );
}
