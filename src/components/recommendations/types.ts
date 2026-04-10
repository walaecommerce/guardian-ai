export interface MissingImageType {
  type: string;
  why_it_matters: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  estimated_conversion_impact: string;
  generation_prompt: string;
  evidence?: string;
}

export interface TitleImprovement {
  issue: string;
  current_example: string;
  suggested_fix: string;
  reason: string;
  evidence?: string;
}

export interface QuickWin {
  action: string;
  effort: 'LOW' | 'MEDIUM' | 'HIGH';
  estimated_impact: string;
  how_to_do_it: string;
  evidence?: string;
}

export interface ImageImprovement {
  image_type: string;
  current_issue: string;
  specific_recommendation: string;
  example_prompt_for_ai_generation: string;
  evidence?: string;
}

export interface SuggestionsData {
  missing_image_types: MissingImageType[];
  title_improvements: TitleImprovement[];
  quick_wins: QuickWin[];
  image_improvements: ImageImprovement[];
  overall_strategy: string;
}
