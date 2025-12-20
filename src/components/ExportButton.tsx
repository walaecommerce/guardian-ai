import { Download, FileJson, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ImageAsset } from '@/types';
import { generateExportData, exportToJSON, exportToPDF } from '@/utils/exportReport';
import { useToast } from '@/hooks/use-toast';

interface ExportButtonProps {
  assets: ImageAsset[];
  listingTitle: string;
  disabled?: boolean;
}

export function ExportButton({ assets, listingTitle, disabled }: ExportButtonProps) {
  const { toast } = useToast();
  
  const analyzedAssets = assets.filter(a => a.analysisResult);
  const isDisabled = disabled || analyzedAssets.length === 0;

  const handleExportJSON = () => {
    try {
      const data = generateExportData(assets, listingTitle);
      exportToJSON(data);
      toast({
        title: 'Export Complete',
        description: 'JSON report downloaded successfully',
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Could not generate JSON report',
        variant: 'destructive',
      });
    }
  };

  const handleExportPDF = () => {
    try {
      const data = generateExportData(assets, listingTitle);
      exportToPDF(data);
      toast({
        title: 'Export Complete',
        description: 'PDF report downloaded successfully',
      });
    } catch (error) {
      toast({
        title: 'Export Failed',
        description: 'Could not generate PDF report',
        variant: 'destructive',
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isDisabled}>
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleExportJSON}>
          <FileJson className="w-4 h-4 mr-2" />
          Export as JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportPDF}>
          <FileText className="w-4 h-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
