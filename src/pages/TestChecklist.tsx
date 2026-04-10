import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Download, ClipboardCheck, ShieldCheck, Zap, BarChart3,
  FileJson, Gauge, CheckCircle2, XCircle, ArrowLeft,
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface TestStep {
  id: string;
  instruction: string;
  expected: string;
}

interface TestCase {
  id: string;
  title: string;
  icon: React.ElementType;
  description: string;
  steps: TestStep[];
}

const TEST_CASES: TestCase[] = [
  {
    id: 'batch-audit',
    title: 'Batch Audit & Rate Limiting',
    icon: ShieldCheck,
    description: 'Import a product and verify sequential processing with rate limit pauses.',
    steps: [
      { id: 'ba-1', instruction: 'Paste an Amazon URL (e.g. https://www.amazon.com/dp/B08BJFV5KJ) and click Import.', expected: 'Product images appear in Uploaded Assets with MAIN/SECONDARY badges and listing title auto-populates.' },
      { id: 'ba-2', instruction: 'Click "Run Batch Audit".', expected: 'Progress bar shows "Analyzing 1 of N..." and updates sequentially.' },
      { id: 'ba-3', instruction: 'Watch the activity log during processing.', expected: 'Each image has a visible 10s pause between analyses. After every 3rd image, a 20s cooldown countdown appears.' },
      { id: 'ba-4', instruction: 'Wait for audit to complete.', expected: 'Analysis Summary shows pass/fail counts, overall score gauge (green ≥85, yellow ≥70, red <70), and individual image cards with scores.' },
      { id: 'ba-5', instruction: 'Confirm the UI remained responsive during processing.', expected: 'You can scroll, switch tabs, and interact with the page throughout the audit — no freezing.' },
    ],
  },
  {
    id: 'fix-ai',
    title: 'Fix with AI',
    icon: Zap,
    description: 'Find a failing image and test the AI fix generation pipeline.',
    steps: [
      { id: 'fx-1', instruction: 'After a batch audit, find an image with FAIL status (score below 85).', expected: 'At least one image card shows a red FAIL badge and a "Fix with AI" button.' },
      { id: 'fx-2', instruction: 'Click "Fix with AI" on the failing image.', expected: 'Fix Modal opens. Activity log shows "Sending to AI..." or "Generating fix...".' },
      { id: 'fx-3', instruction: 'Wait for the fix to generate.', expected: 'A generated image appears in the modal with before/after comparison.' },
      { id: 'fx-4', instruction: 'Check the before and after scores.', expected: 'Both the original score and new score are visible. The new score should be higher.' },
      { id: 'fx-5', instruction: 'Click the Download button on the fixed image.', expected: 'A PNG file downloads to your computer.' },
    ],
  },
  {
    id: 'competitor',
    title: 'Competitor Comparison',
    icon: BarChart3,
    description: 'Import a competitor product and verify the comparison report.',
    steps: [
      { id: 'cp-1', instruction: 'After auditing your main product, toggle "Enable Competitor Analysis".', expected: 'A competitor URL input field appears with an "Analyze" button.' },
      { id: 'cp-2', instruction: 'Paste a competitor URL (e.g. https://www.amazon.com/dp/B09G9FPHY6) and click Analyze.', expected: 'Button changes to "Analyzing..." and competitor images begin processing.' },
      { id: 'cp-3', instruction: 'Wait for competitor analysis to complete (5-10 min).', expected: 'The Compare tab in the results panel becomes populated.' },
      { id: 'cp-4', instruction: 'Click the Compare tab.', expected: 'Side-by-side scores for both products, competitive gaps, advantages, and priority actions are listed.' },
      { id: 'cp-5', instruction: 'Verify the AI comparison intelligence section.', expected: 'AI-generated insights show score comparison, missing image types, competitor weaknesses, and prioritized actions.' },
    ],
  },
  {
    id: 'score-card',
    title: '6-Dimension Score Card',
    icon: Gauge,
    description: 'Generate the Listing Health Score Card and verify all dimensions.',
    steps: [
      { id: 'sc-1', instruction: 'After a completed batch audit, click the "Score Card" tab.', expected: 'A "Generate Score Card" button appears with description of 6 dimensions.' },
      { id: 'sc-2', instruction: 'Click "Generate Score Card".', expected: 'Button shows loading spinner, then the full score card renders.' },
      { id: 'sc-3', instruction: 'Verify the overall Health Score ring.', expected: 'Large animated ring shows a weighted score (0-100) with color coding and "HEALTH" label.' },
      { id: 'sc-4', instruction: 'Check all 6 dimension gauges.', expected: 'Compliance (×30%), Completeness (×20%), Diversity (×15%), Readability (×15%), Emotion (×10%), Brand (×10%) — all show real numbers, not 0/undefined/NaN.' },
      { id: 'sc-5', instruction: 'Review the Top 3 Priority Actions.', expected: 'Three numbered action items appear, each referencing the lowest-scoring dimensions with specific recommendations.' },
    ],
  },
  {
    id: 'export',
    title: 'Export Report (JSON)',
    icon: FileJson,
    description: 'Export the compliance report and verify the JSON structure.',
    steps: [
      { id: 'ex-1', instruction: 'After a completed batch audit, click the "Export" dropdown button.', expected: 'A dropdown menu shows options: Export Report (JSON), Export PDF, PDF Summary, and ZIP options.' },
      { id: 'ex-2', instruction: 'Click "Export Report (JSON)".', expected: 'A file named guardian-report-YYYY-MM-DD.json downloads.' },
      { id: 'ex-3', instruction: 'Open the downloaded JSON file in a text editor.', expected: 'Valid JSON with proper formatting (pretty-printed).' },
      { id: 'ex-4', instruction: 'Verify required top-level fields.', expected: 'Contains: timestamp (ISO string), listing_title (string), overall_status ("PASS" or "FAIL"), total_assets, passed, failed.' },
      { id: 'ex-5', instruction: 'Verify the assets array.', expected: 'Each asset object has: filename, type, score (number), status ("PASS"/"FAIL"), severity, violations (array), fixed (boolean).' },
    ],
  },
];

type StepResult = 'untested' | 'pass' | 'fail';

interface TestState {
  results: Record<string, StepResult>;
  notes: Record<string, string>;
}

function getInitialState(): TestState {
  return {
    results: {},
    notes: {},
  };
}

function generateMarkdownReport(state: TestState, testerName: string): string {
  const now = new Date().toLocaleString();
  let md = `# Guardian AI — QA Test Report\n\n`;
  md += `**Tester:** ${testerName || 'Anonymous'}\n`;
  md += `**Date:** ${now}\n\n`;

  let totalPass = 0, totalFail = 0, totalUntested = 0;

  for (const tc of TEST_CASES) {
    md += `## ${tc.title}\n\n`;
    md += `| # | Step | Expected | Result |\n`;
    md += `|---|------|----------|--------|\n`;
    for (let i = 0; i < tc.steps.length; i++) {
      const step = tc.steps[i];
      const result = state.results[step.id] || 'untested';
      const icon = result === 'pass' ? '✅ PASS' : result === 'fail' ? '❌ FAIL' : '⬜ UNTESTED';
      if (result === 'pass') totalPass++;
      else if (result === 'fail') totalFail++;
      else totalUntested++;
      md += `| ${i + 1} | ${step.instruction.replace(/\|/g, '\\|')} | ${step.expected.replace(/\|/g, '\\|')} | ${icon} |\n`;
    }
    const note = state.notes[tc.id];
    if (note) {
      md += `\n**Notes:** ${note}\n`;
    }
    md += `\n`;
  }

  md += `---\n\n`;
  md += `**Summary:** ${totalPass} passed, ${totalFail} failed, ${totalUntested} untested out of ${totalPass + totalFail + totalUntested} total steps.\n`;

  return md;
}

export default function TestChecklist() {
  const [state, setState] = useState<TestState>(getInitialState);
  const [testerName, setTesterName] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const setStepResult = (stepId: string, result: StepResult) => {
    setState(prev => ({
      ...prev,
      results: { ...prev.results, [stepId]: result },
    }));
  };

  const setTestNote = (testId: string, note: string) => {
    setState(prev => ({
      ...prev,
      notes: { ...prev.notes, [testId]: note },
    }));
  };

  const totalSteps = TEST_CASES.reduce((sum, tc) => sum + tc.steps.length, 0);
  const passCount = Object.values(state.results).filter(r => r === 'pass').length;
  const failCount = Object.values(state.results).filter(r => r === 'fail').length;
  const testedCount = passCount + failCount;

  const downloadReport = () => {
    const md = generateMarkdownReport(state, testerName);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `guardian-qa-report-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getTestStatus = (tc: TestCase): 'pass' | 'fail' | 'partial' | 'untested' => {
    const results = tc.steps.map(s => state.results[s.id] || 'untested');
    if (results.every(r => r === 'pass')) return 'pass';
    if (results.some(r => r === 'fail')) return 'fail';
    if (results.some(r => r === 'pass')) return 'partial';
    return 'untested';
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-[#232F3E] text-white">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back to Guardian</span>
            </Link>
            <Separator orientation="vertical" className="h-6 bg-white/20" />
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-[#FF9900]" />
              <h1 className="text-base font-semibold">QA Test Checklist</h1>
            </div>
          </div>
          <Button
            onClick={downloadReport}
            size="sm"
            className="bg-[#FF9900] hover:bg-[#e88b00] text-[#232F3E] font-semibold"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Download Report
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Summary Bar */}
        <Card className="border-primary/20">
          <CardContent className="pt-5 pb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">{testedCount}/{totalSteps}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Tested</div>
                </div>
                <Separator orientation="vertical" className="h-10" />
                <div className="text-center">
                  <div className="text-2xl font-bold text-[hsl(var(--chart-2))]">{passCount}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Passed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-destructive">{failCount}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-muted-foreground">{totalSteps - testedCount}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide">Remaining</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Tester:</label>
                <input
                  className="h-8 px-3 text-sm border rounded-md bg-background w-40"
                  placeholder="Your name"
                  value={testerName}
                  onChange={e => setTesterName(e.target.value)}
                />
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden flex">
              {passCount > 0 && (
                <div className="h-full bg-[hsl(var(--chart-2))] transition-all" style={{ width: `${(passCount / totalSteps) * 100}%` }} />
              )}
              {failCount > 0 && (
                <div className="h-full bg-destructive transition-all" style={{ width: `${(failCount / totalSteps) * 100}%` }} />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Test Case Cards */}
        <div ref={scrollRef} className="space-y-5">
          {TEST_CASES.map((tc, tcIdx) => {
            const status = getTestStatus(tc);
            const Icon = tc.icon;

            return (
              <Card key={tc.id} className={`transition-all ${
                status === 'pass' ? 'border-[hsl(var(--chart-2))]/40' :
                status === 'fail' ? 'border-destructive/40' :
                'border-border'
              }`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2.5 text-base">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        status === 'pass' ? 'bg-[hsl(var(--chart-2))]/15 text-[hsl(var(--chart-2))]' :
                        status === 'fail' ? 'bg-destructive/15 text-destructive' :
                        'bg-primary/10 text-primary'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span>Test {tcIdx + 1}: {tc.title}</span>
                    </CardTitle>
                    <Badge variant={
                      status === 'pass' ? 'default' :
                      status === 'fail' ? 'destructive' :
                      'outline'
                    } className={status === 'pass' ? 'bg-[hsl(var(--chart-2))] hover:bg-[hsl(var(--chart-2))]' : ''}>
                      {status === 'pass' ? 'ALL PASS' :
                       status === 'fail' ? 'HAS FAILURES' :
                       status === 'partial' ? 'IN PROGRESS' : 'NOT STARTED'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{tc.description}</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {tc.steps.map((step, stepIdx) => {
                    const result = state.results[step.id] || 'untested';

                    return (
                      <div
                        key={step.id}
                        className={`rounded-lg border p-3 transition-colors ${
                          result === 'pass' ? 'bg-[hsl(var(--chart-2))]/5 border-[hsl(var(--chart-2))]/20' :
                          result === 'fail' ? 'bg-destructive/5 border-destructive/20' :
                          'bg-muted/30'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground mt-0.5">
                            {stepIdx + 1}
                          </span>
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <p className="text-sm font-medium leading-snug">{step.instruction}</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              <span className="font-semibold">Expected:</span> {step.expected}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => setStepResult(step.id, result === 'pass' ? 'untested' : 'pass')}
                              className={`w-8 h-8 rounded-md flex items-center justify-center transition-all border ${
                                result === 'pass'
                                  ? 'bg-[hsl(var(--chart-2))] text-white border-[hsl(var(--chart-2))]'
                                  : 'bg-background text-muted-foreground border-border hover:border-[hsl(var(--chart-2))]/50'
                              }`}
                              title="Mark as PASS"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setStepResult(step.id, result === 'fail' ? 'untested' : 'fail')}
                              className={`w-8 h-8 rounded-md flex items-center justify-center transition-all border ${
                                result === 'fail'
                                  ? 'bg-destructive text-white border-destructive'
                                  : 'bg-background text-muted-foreground border-border hover:border-destructive/50'
                              }`}
                              title="Mark as FAIL"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Notes */}
                  <div className="pt-2">
                    <Textarea
                      placeholder={`Notes for "${tc.title}"...`}
                      className="text-sm min-h-[60px] resize-none"
                      value={state.notes[tc.id] || ''}
                      onChange={e => setTestNote(tc.id, e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
