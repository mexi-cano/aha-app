import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requestAppReload } from "@/data/app-reload";

export function UpdateManager() {
  const location = useLocation();
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const [needRefresh, setNeedRefresh] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    const trackWaitingWorker = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        setNeedRefresh(true);
      }
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            setNeedRefresh(true);
          }
        });
      });
    };
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .then((registration) => {
        if (cancelled) return;
        registrationRef.current = registration;
        trackWaitingWorker(registration);
        void registration.update();
      })
      .catch(() => {
        // The current cached app remains usable if update registration fails.
      });

    const check = () => void registrationRef.current?.update();
    const foreground = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("online", check);
    document.addEventListener("visibilitychange", foreground);
    return () => {
      cancelled = true;
      window.removeEventListener("online", check);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, []);

  const installUpdate = () => {
    const waiting = registrationRef.current?.waiting;
    if (!waiting || location.pathname !== "/") return;
    let reloading = false;
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        if (reloading) return;
        reloading = true;
        requestAppReload("pwa_update");
      },
      { once: true },
    );
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  if (!needRefresh) return null;
  const isHome = location.pathname === "/";
  return (
    <aside
      className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-[700px] rounded-xl border border-primary/30 bg-card p-4 shadow-xl"
      role="status"
    >
      <div className="flex items-center gap-3">
        <RefreshCw
          className="size-5 shrink-0 text-primary"
          aria-hidden="true"
        />
        <p className="min-w-0 flex-1 text-sm font-semibold leading-relaxed">
          {isHome
            ? "An app update is ready. Saved AHAs and queued backups stay on this iPad."
            : "An app update is ready. Finish this AHA and return Home to install it safely."}
        </p>
        {isHome ? (
          <Button className="min-h-12 shrink-0" onClick={installUpdate}>
            Update now
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
