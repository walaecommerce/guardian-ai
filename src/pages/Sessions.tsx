import { SessionHistory } from '@/components/SessionHistory';

const Sessions = () => {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-1">Session History</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Browse and resume previous audit sessions.
        </p>
        <SessionHistory />
      </div>
    </div>
  );
};

export default Sessions;
