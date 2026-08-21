export interface TrendHeuristics {
  strongHookWindow: number;
  idealPauseMax: number;
  visualChangeSeconds: number;
  preferSelfContained: boolean;
  payoffEnding: boolean;
  emotionalKeywords: string[];
  curiosityKeywords: string[];
}

export const localTrendHeuristics: TrendHeuristics = {
  strongHookWindow: 1.5,
  idealPauseMax: 0.65,
  visualChangeSeconds: 3.2,
  preferSelfContained: true,
  payoffEnding: true,
  emotionalKeywords: ['love', 'hate', 'never', 'worst', 'best', 'fear', 'changed', 'shocked', 'incredible', 'mistake'],
  curiosityKeywords: ['why', 'secret', 'actually', 'truth', 'until', 'but', 'realised', 'discovered', 'nobody', 'imagine'],
};

export const trendSources = [
  {
    name: 'Local editing heuristics',
    status: 'active' as const,
    detail: 'Hook speed, silence density, self-contained stories and payoff endings.',
  },
  {
    name: 'YouTube public API',
    status: 'available' as const,
    detail: 'Connect a legitimate API key later to ingest public trend metadata.',
  },
  {
    name: 'Custom trend feed',
    status: 'available' as const,
    detail: 'Provider interface ready for licensed or first-party trend data.',
  },
];
