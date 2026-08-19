import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-background px-5 py-12">
      <section className="mx-auto max-w-lg rounded-2xl border border-card-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="mt-3 text-base font-medium text-muted-foreground">
          This page isn't part of today's AHA flow.
        </p>
        <Button
          className="mt-6 min-h-12 px-6 text-base"
          onClick={() => navigate("/")}
        >
          Return Home
        </Button>
      </section>
    </main>
  );
}
