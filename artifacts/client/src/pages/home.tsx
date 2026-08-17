import { useHealthCheckDb } from '@workspace/api-client-react';

export default function Home() {
  const { data, isLoading, isError } = useHealthCheckDb();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-lg border border-card-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-primary" data-testid="text-title">
          ITS AHA
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Project skeleton — screens arrive in later phases.
        </p>
        <div className="mt-6 rounded-md bg-secondary p-4 text-left text-sm">
          <p className="font-semibold text-secondary-foreground">System check</p>
          <p className="mt-2 text-foreground" data-testid="text-health">
            {isLoading && 'Checking server and database…'}
            {isError && 'Server or database unreachable'}
            {data && `Server: ${data.status} · Database: ${data.database} ✓`}
          </p>
        </div>
      </div>
    </div>
  );
}
