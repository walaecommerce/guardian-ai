import { Link } from 'react-router-dom';
import { SessionHistory } from '@/components/SessionHistory';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

const Sessions = () => {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-1">Session History</h1>
            <p className="text-sm text-muted-foreground">
              Continue previous work, review results, or export reports.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/audit"><Plus className="w-3.5 h-3.5 mr-1" /> New Audit</Link>
          </Button>
        </div>
        <SessionHistory />
      </div>
    </div>
  );
};

export default Sessions;
