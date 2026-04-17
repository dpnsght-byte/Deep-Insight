export interface Ticker {
  id: string;
  symbol: string;
  name?: string;
  addedAt: string;
  addedBy: string;
  generatePodcast: number;
  generateShorts: number;
  voiceModel?: 'studio' | 'neural';
}

export interface Filing {
  id: string;
  ticker: string;
  formType: string;
  filingDate: string;
  accessionNumber: string;
  url: string;
  rawContent?: string;
  summary?: string;
  podcastScript?: string;
  shortsScript?: string;
  audioBase64?: string;
  shortsAudioBase64?: string;
  videoPath?: string;
  status: 'pending' | 'processing' | 'architect_working' | 'analyst_working' | 'podcast_scripting' | 'shorts_scripting' | 'audio_generating' | 'video_rendering' | 'podcast_generated' | 'completed' | 'failed';
  error?: string;
  createdAt: string;
  companyName?: string;
  currentStep?: number;
  totalSteps?: number;
  periodEndDate?: string;
}
