import { Download, FileJson, FileText, FolderArchive, ImageIcon, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ImageAsset } from '@/types';
import { generateExportData, exportToJSON, exportToPDF, exportToPDFSummary } from '@/utils/exportReport';
import { exportFixedImagesAsZip, exportAllImagesAsZip } from '@/utils/zipExport';
import { useToast } from '@/hooks/use-toast';
import { CompetitorData } from '@/components/CompetitorAudit';

interface ExportButtonProps {
  assets: ImageAsset[];
  listingTitle: string;
  productAsin?: string;
  competitorData?: CompetitorData | null;
  disabled?: boolean;
}

export function ExportButton({ assets, listingTitle, productAsin, competitorData, disabled }: ExportButtonProps) {
  const { toast } = useToast();
  
  const analyzedAssets = assets.filter(a => a.analysisResult);
  const fixedAssets = assets.filter(a => a.fixedImage);
  const isDisabled = disabled || analyzedAssets.length === 0;

  const handleExportJSON = () => {
    try {
      const data = generateExportData(assets, listingTitle, competitorData);
      exportToJSON(data);
      toast({ title: 'Export Complete', description: 'JSON report downloaded successfully' });
    } catch {
      toast({ title: 'Export Failed', description: 'Could not generate JSON report', variant: 'destructive' });
    }
  };

  const handleExportPDF = () => {
    try {
      const data = generateExportData(assets, listingTitle);
      exportToPDF(data);
      toast({ title: 'Export Complete', description: 'PDF report downloaded successfully' });
    } catch {
      toast({ title: 'Export Failed', description: 'Could not generate PDF report', variant: 'destructive' });
    }
  };

  const handleExportPDFSummary = () => {
    try {
      const data = generateExportData(assets, listingTitle);
      exportToPDFSummary(data);
    } catch {
      toast({ title: 'Export Failed', description: 'Could not open print dialog', variant: 'destructive' });
    }
  };

  const handleExportFixedImages = async () => {
    try {
      await exportFixedImagesAsZip(assets, productAsin);
      toast({ title: 'Export Complete', description: `${fixedAssets.length} fixed images downloaded as ZIP` });
    } catch (error) {
      toast({ title: 'Export Failed', description: error instanceof Error ? error.message : 'Could not export images', variant: 'destructive' });
    }
  };

  const handleExportAllImages = async () => {
    try {
      await exportAllImagesAsZip(assets, productAsin);
      toast({ title: 'Export Complete', description: 'All images downloaded as ZIP' });
    } catch (error) {
      toast({ title: 'Export Failed', description: error instanceof Error ? error.message : 'Could not export images', variant: 'destructive' });
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
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={handleExportJSON}>
          <FileJson className="w-4 h-4 mr-2" />
          Export Report (JSON)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportPDF}>
          <FileText className="w-4 h-4 mr-2" />
          Export Report (PDF)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportPDFSummary}>
          <Printer className="w-4 h-4 mr-2" />
          Export PDF Summary
        </DropdownMenuItem>
        
        {(fixedAssets.length > 0 || assets.length > 0) && (
          <>
            <DropdownMenuSeparator />
            {fixedAssets.length > 0 && (
              <DropdownMenuItem onClick={handleExportFixedImages}>
                <ImageIcon className="w-4 h-4 mr-2" />
                Download Fixed Images ({fixedAssets.length})
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={handleExportAllImages}>
              <FolderArchive className="w-4 h-4 mr-2" />
              Download All (ZIP)
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
