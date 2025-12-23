-- Add delete policy for compliance_reports
CREATE POLICY "Anyone can delete reports" 
ON public.compliance_reports 
FOR DELETE 
USING (true);