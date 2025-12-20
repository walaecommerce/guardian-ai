import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { ImageAsset } from '@/types';

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

export interface ExportData {
  listingTitle: string;
  exportDate: string;
  summary: {
    totalAssets: number;
    passCount: number;
    failCount: number;
    averageScore: number;
  };
  assets: {
    name: string;
    type: string;
    score: number;
    status: string;
    violations: {
      severity: string;
      category: string;
      message: string;
      recommendation: string;
    }[];
    recommendations: string[];
  }[];
}

export function generateExportData(assets: ImageAsset[], listingTitle: string): ExportData {
  const analyzedAssets = assets.filter(a => a.analysisResult);
  const passCount = analyzedAssets.filter(a => a.analysisResult?.status === 'PASS').length;
  const failCount = analyzedAssets.filter(a => a.analysisResult?.status === 'FAIL').length;
  const avgScore = analyzedAssets.length > 0
    ? Math.round(analyzedAssets.reduce((sum, a) => sum + (a.analysisResult?.overallScore || 0), 0) / analyzedAssets.length)
    : 0;

  return {
    listingTitle: listingTitle || 'Untitled Listing',
    exportDate: new Date().toISOString(),
    summary: {
      totalAssets: analyzedAssets.length,
      passCount,
      failCount,
      averageScore: avgScore,
    },
    assets: analyzedAssets.map(asset => ({
      name: asset.name,
      type: asset.type,
      score: asset.analysisResult?.overallScore || 0,
      status: asset.analysisResult?.status || 'UNKNOWN',
      violations: asset.analysisResult?.violations || [],
      recommendations: asset.analysisResult?.fixRecommendations || [],
    })),
  };
}

export function exportToJSON(data: ExportData): void {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `guardian-report-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  
  URL.revokeObjectURL(url);
}

export function exportToPDF(data: ExportData): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFillColor(35, 47, 62); // Amazon dark blue
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Amazon Listing Guardian', 14, 20);
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Compliance Report', 14, 30);
  
  // Report info
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(`Date: ${new Date(data.exportDate).toLocaleDateString()}`, pageWidth - 14, 50, { align: 'right' });
  
  // Listing title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Listing:', 14, 55);
  doc.setFont('helvetica', 'normal');
  const titleLines = doc.splitTextToSize(data.listingTitle, pageWidth - 50);
  doc.text(titleLines, 40, 55);
  
  // Summary section
  const summaryY = 70 + (titleLines.length - 1) * 5;
  
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(14, summaryY, pageWidth - 28, 30, 3, 3, 'F');
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', 20, summaryY + 10);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const summaryItems = [
    { label: 'Total Images', value: data.summary.totalAssets.toString() },
    { label: 'Passed', value: data.summary.passCount.toString(), color: [34, 139, 34] },
    { label: 'Failed', value: data.summary.failCount.toString(), color: [220, 53, 69] },
    { label: 'Avg Score', value: `${data.summary.averageScore}%` },
  ];
  
  let xPos = 20;
  summaryItems.forEach((item, index) => {
    doc.setTextColor(100, 100, 100);
    doc.text(item.label + ':', xPos, summaryY + 22);
    
    if (item.color) {
      doc.setTextColor(item.color[0], item.color[1], item.color[2]);
    } else {
      doc.setTextColor(0, 0, 0);
    }
    doc.setFont('helvetica', 'bold');
    doc.text(item.value, xPos + 30, summaryY + 22);
    doc.setFont('helvetica', 'normal');
    
    xPos += 45;
  });
  
  // Assets table
  let currentY = summaryY + 45;
  
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Image Analysis Results', 14, currentY);
  
  currentY += 8;
  
  const tableData = data.assets.map(asset => [
    asset.name.length > 25 ? asset.name.substring(0, 22) + '...' : asset.name,
    asset.type,
    `${asset.score}%`,
    asset.status,
    asset.violations.length.toString(),
  ]);
  
  doc.autoTable({
    startY: currentY,
    head: [['Image', 'Type', 'Score', 'Status', 'Issues']],
    body: tableData,
    theme: 'striped',
    headStyles: { 
      fillColor: [35, 47, 62],
      textColor: 255,
      fontStyle: 'bold',
    },
    bodyStyles: {
      textColor: [50, 50, 50],
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 30 },
      2: { cellWidth: 25 },
      3: { cellWidth: 25 },
      4: { cellWidth: 25 },
    },
    margin: { left: 14, right: 14 },
  });
  
  // Violations details
  currentY = doc.lastAutoTable.finalY + 15;
  
  data.assets.forEach(asset => {
    if (asset.violations.length === 0) return;
    
    // Check if we need a new page
    if (currentY > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage();
      currentY = 20;
    }
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(`${asset.name} - Violations`, 14, currentY);
    currentY += 6;
    
    const violationData = asset.violations.map(v => [
      v.severity.toUpperCase(),
      v.category,
      v.message.length > 50 ? v.message.substring(0, 47) + '...' : v.message,
    ]);
    
    doc.autoTable({
      startY: currentY,
      head: [['Severity', 'Category', 'Message']],
      body: violationData,
      theme: 'plain',
      headStyles: { 
        fillColor: [245, 245, 245],
        textColor: [50, 50, 50],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [80, 80, 80],
      },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 35 },
        2: { cellWidth: 100 },
      },
      margin: { left: 14, right: 14 },
    });
    
    currentY = doc.lastAutoTable.finalY + 10;
  });
  
  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Generated by Amazon Listing Guardian | Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }
  
  doc.save(`guardian-report-${new Date().toISOString().split('T')[0]}.pdf`);
}
