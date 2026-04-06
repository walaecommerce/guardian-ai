import { useState } from 'react';
import { Loader2, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface BulkUrlImportProps {
  isImporting: boolean;
  onBulkImport: (urls: string[]) => void;
  bulkProgress?: { current: number; total: number } | null;
}

export function BulkUrlImport({ isImporting, onBulkImport, bulkProgress }: BulkUrlImportProps) {
  const [urlText, setUrlText] = useState('');

  const urls = urlText
    .split('\n')
    .map(u => u.trim())
    .filter(u => u.length > 0);

  const validUrls = urls.filter(u => /amazon\.\w+/.test(u));
  const invalidCount = urls.length - validUrls.length;

  const handleImport = () => {
    if (validUrls.length === 0) return;
    onBulkImport(validUrls.slice(0, 10));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <List className="w-4 h-4 text-primary" />
          Bulk Import (up to 10 URLs)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          placeholder={"Paste Amazon product URLs, one per line:\nhttps://amazon.com/dp/B0EXAMPLE1\nhttps://amazon.com/dp/B0EXAMPLE2"}
          value={urlText}
          onChange={(e) => setUrlText(e.target.value)}
          className="min-h-[120px] font-mono text-xs"
          disabled={isImporting}
        />

        {urls.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {validUrls.length} valid URL{validUrls.length !== 1 ? 's' : ''} detected
            {invalidCount > 0 && <span className="text-destructive"> · {invalidCount} invalid</span>}
            {validUrls.length > 10 && <span className="text-destructive"> · only first 10 will be processed</span>}
          </p>
        )}

        {bulkProgress && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Importing {bulkProgress.current} of {bulkProgress.total}...
            </p>
            <Progress value={(bulkProgress.current / bulkProgress.total) * 100} className="h-2" />
          </div>
        )}

        <Button
          onClick={handleImport}
          disabled={validUrls.length === 0 || isImporting}
          className="w-full"
        >
          {isImporting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Importing...
            </>
          ) : (
            `Import ${validUrls.length} URL${validUrls.length !== 1 ? 's' : ''}`
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
