import React, { useState, useEffect, useRef } from 'react';
import { FileText, AlertCircle, RefreshCw, Play, Square, Download, ExternalLink, TrendingUp, TrendingDown, Minus, Volume2 } from 'lucide-react';
import { Filing } from '../types';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from "motion/react";

const Dashboard: React.FC = () => {
  const [filings, setFilings] = useState<Filing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiling, setSelectedFiling] = useState<Filing | null>(null);
  const [isGeneratingPodcast, setIsGeneratingPodcast] = useState(false);
  const [isGeneratingShort, setIsGeneratingShort] = useState(false);
  const [playingType, setPlayingType] = useState<'podcast' | 'short' | 'video' | null>(null);
  const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const getHumanFormType = (type: string) => {
    if (type === '10-K') return 'Annual Report';
    if (type === '10-Q') return 'Quarterly Report';
    return type;
  };

  const ProgressBar = ({ current, total, label }: { current?: number, total?: number, label: string }) => {
    if (current === undefined || total === undefined || total === 0) return null;
    const percentage = Math.min(Math.round((current / total) * 100), 100);
    return (
      <div className="space-y-1.5 w-full">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
          <span className="text-blue-400">{label}</span>
          <span className="text-slate-500">{current} / {total} ({percentage}%)</span>
        </div>
        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
          />
        </div>
      </div>
    );
  };

  const stopAllPlayback = () => {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      setActiveAudio(null);
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setPlayingType(null);
  };

  const playConversation = async (filing: Filing) => {
    if (!filing.podcastScript) return;
    
    if (playingType === 'podcast') {
      stopAllPlayback();
      return;
    }

    stopAllPlayback();

    // If we already have the audio, just play it
    if (filing.audioBase64 && filing.audioBase64.length > 100) {
      const audioBlob = await fetch(`data:audio/wav;base64,${filing.audioBase64}`).then(res => res.blob());
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => setPlayingType(null);
      setActiveAudio(audio);
      setPlayingType('podcast');
      audio.play();
      return;
    }

    setIsGeneratingPodcast(true);
    try {
      const script = JSON.parse(filing.podcastScript);

      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, filingId: filing.id, type: 'podcast' })
      });

      if (!response.ok) throw new Error('TTS request failed');
      const { audioBase64 } = await response.json();

      if (audioBase64) {
        const audioBlob = await fetch(`data:audio/wav;base64,${audioBase64}`).then(res => res.blob());
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.onended = () => setPlayingType(null);
        setActiveAudio(audio);
        setPlayingType('podcast');
        audio.play();
        
        // Update local state so we don't regenerate next time
        setFilings(prev => prev.map(f => f.id === filing.id ? { ...f, audioBase64 } : f));
      }
    } catch (err) {
      console.error("TTS failed:", err);
      setError("Failed to generate human conversation audio. Please try again.");
    } finally {
      setIsGeneratingPodcast(false);
    }
  };

  const playShortVoiceover = async (filing: Filing) => {
    if (!filing.shortsScript) return;
    
    if (playingType === 'short') {
      stopAllPlayback();
      return;
    }

    stopAllPlayback();

    // If we already have the audio, just play it
    if (filing.shortsAudioBase64 && filing.shortsAudioBase64.length > 100) {
      const audioBlob = await fetch(`data:audio/wav;base64,${filing.shortsAudioBase64}`).then(res => res.blob());
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => setPlayingType(null);
      setActiveAudio(audio);
      setPlayingType('short');
      audio.play();
      return;
    }

    setIsGeneratingShort(true);
    try {
      const script = JSON.parse(filing.shortsScript);
      const text = script.shortsScript || filing.shortsScript;
      
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceName: 'Aoede', filingId: filing.id, type: 'short' })
      });

      if (!response.ok) throw new Error('TTS request failed');
      const { audioBase64 } = await response.json();

      if (audioBase64) {
        const audioBlob = await fetch(`data:audio/wav;base64,${audioBase64}`).then(res => res.blob());
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.onended = () => setPlayingType(null);
        setActiveAudio(audio);
        setPlayingType('short');
        audio.play();

        // Update local state so we don't regenerate next time
        setFilings(prev => prev.map(f => f.id === filing.id ? { ...f, shortsAudioBase64: audioBase64 } : f));
      }
    } catch (err) {
      console.error("TTS failed:", err);
    } finally {
      setIsGeneratingShort(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchFilings = async (retries = 3) => {
      try {
        const response = await fetch('/api/filings');
        if (!isMounted) return;

        if (response.ok) {
          const data = await response.json();
          setFilings(data);
          setError(null);
        } else {
          // If server returns an error, don't immediately show a big error box
          // unless we've failed multiple times
          if (retries === 0) {
            const errorData = await response.json().catch(() => ({ error: 'Server error' }));
            setError(errorData.error || 'Failed to fetch filings');
          }
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error("Failed to fetch filings:", err);
        
        if (retries > 0) {
          // Silent retry
          setTimeout(() => fetchFilings(retries - 1), 3000);
        } else if (loading) {
          // Only show error if it's the initial load
          setError("The server is currently busy or restarting. Please wait...");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchFilings();
    const interval = setInterval(() => fetchFilings(1), 10000); // Poll every 10s with 1 retry
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Update selected filing if it's updated in the list
  useEffect(() => {
    if (selectedFiling) {
      const updated = filings.find(f => f.id === selectedFiling.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedFiling)) {
        setSelectedFiling(updated);
      }
    }
  }, [filings, selectedFiling]);

  const getSentimentIcon = (summary: string) => {
    if (summary.toLowerCase().includes('bullish')) return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (summary.toLowerCase().includes('bearish')) return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-slate-500" />;
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-white">Market Intelligence</h2>
          <p className="text-slate-400 mt-1">Real-time analysis of the latest SEC filings.</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 border border-slate-700 rounded-md text-sm font-medium text-slate-400">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Live Updates Active
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-900/50 p-4 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
          <div>
            <h3 className="text-red-500 font-semibold">Error fetching filings</h3>
            <p className="text-red-400/80 text-sm">{error}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Filings List */}
        <div className="lg:col-span-1 space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto pr-2 custom-scrollbar">
          {loading && filings.length === 0 ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="h-24 bg-slate-900/50 animate-pulse rounded-lg border border-slate-800" />
            ))
          ) : filings.length === 0 ? (
            <div className="text-center py-20 bg-slate-900/50 rounded-xl border border-slate-800">
              <FileText className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500">No filings found.</p>
            </div>
          ) : (
            filings.map((filing) => (
              <button
                key={filing.id}
                onClick={() => setSelectedFiling(filing)}
                className={`w-full text-left p-4 rounded-lg border transition-all ${
                  selectedFiling?.id === filing.id 
                    ? 'bg-blue-600/10 border-blue-500/50 ring-1 ring-blue-500/50' 
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-mono text-blue-400 uppercase tracking-wider">{filing.ticker}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    ['podcast_generated', 'completed'].includes(filing.status) ? 'bg-green-900/30 text-green-400' :
                    ['processing', 'architect_working', 'analyst_working', 'podcast_scripting', 'shorts_scripting', 'audio_generating', 'video_rendering'].includes(filing.status) ? 'bg-blue-900/30 text-blue-400' :
                    filing.status === 'failed' ? 'bg-red-900/30 text-red-400' :
                    'bg-slate-800 text-slate-400'
                  }`}>
                    {filing.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <h3 className="text-white font-semibold truncate">{getHumanFormType(filing.formType)}</h3>
                <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500">
                  <span>{new Date(filing.filingDate).toLocaleDateString()}</span>
                  {filing.periodEndDate && (
                    <>
                      <span>•</span>
                      <span>Ends {new Date(filing.periodEndDate).toLocaleDateString()}</span>
                    </>
                  )}
                  <span>•</span>
                  <span>{filing.companyName || 'Unknown'}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Analysis Detail */}
        <div className="lg:col-span-2">
          {selectedFiling ? (
            <div key={selectedFiling.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-full min-h-[600px]">
              <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-2xl font-bold text-white">{selectedFiling.ticker}</h2>
                    <span className="text-slate-500">|</span>
                    <span className="text-slate-400">{getHumanFormType(selectedFiling.formType)}</span>
                    {selectedFiling.periodEndDate && (
                      <span className="text-slate-500 text-sm ml-2">
                        Fiscal Period Ended {new Date(selectedFiling.periodEndDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500">{selectedFiling.companyName}</p>
                </div>
                <div className="flex gap-2">
                  <a 
                    href={selectedFiling.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-all"
                    title="View Original Filing"
                  >
                    <ExternalLink className="w-5 h-5" />
                  </a>
                </div>
              </div>

              <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                {['pending', 'processing', 'architect_working', 'analyst_working'].includes(selectedFiling.status) ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <RefreshCw className="w-12 h-12 animate-spin mb-4 text-blue-500" />
                    <h3 className="text-white font-semibold text-lg">
                      {selectedFiling.status === 'pending' ? 'Waiting in Queue' :
                       selectedFiling.status === 'processing' ? 'Initializing Pipeline' :
                       selectedFiling.status === 'architect_working' ? 'Architect Agent: Mapping Narrative' :
                       selectedFiling.status === 'analyst_working' ? 'Analyst Agent: Extracting Insights' :
                       'AI Analysis in Progress'}
                    </h3>
                    <p className="text-sm max-w-xs text-center mt-2 mb-6">
                      {selectedFiling.status === 'pending' ? 'This filing is queued for processing. Our agents will start soon.' :
                       'Our multi-agent pipeline is currently breaking down this filing. This usually takes 30-60 seconds.'}
                    </p>
                    <div className="w-full max-w-sm">
                      <ProgressBar 
                        current={selectedFiling.currentStep} 
                        total={selectedFiling.totalSteps} 
                        label={selectedFiling.status.replace(/_/g, ' ')} 
                      />
                    </div>
                  </div>
                ) : selectedFiling.status === 'failed' ? (
                  <div className="bg-red-900/10 border border-red-900/30 p-6 rounded-lg text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h3 className="text-red-500 font-semibold text-lg">Analysis Failed</h3>
                    <p className="text-red-400/80 text-sm mt-2">{selectedFiling.error || 'An unexpected error occurred during processing.'}</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Loading indicator for background tasks */}
                    {['podcast_scripting', 'shorts_scripting', 'audio_generating', 'video_rendering'].includes(selectedFiling.status) && (
                      (() => {
                        // Hide banner if the specific thing it's "generating" is already there
                        if (selectedFiling.status === 'podcast_scripting' && selectedFiling.podcastScript) return null;
                        if (selectedFiling.status === 'shorts_scripting' && selectedFiling.shortsScript) return null;
                        if (selectedFiling.status === 'audio_generating' && selectedFiling.audioBase64 && selectedFiling.shortsAudioBase64) return null;
                        if (selectedFiling.status === 'video_rendering' && selectedFiling.videoPath) return null;

                        return (
                          <div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-xl flex items-center gap-4 mb-6">
                            <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                            <div className="flex-1">
                              <h4 className="text-sm font-bold text-blue-400">
                                {selectedFiling.status === 'podcast_scripting' ? 'Drafting Podcast Script...' :
                                 selectedFiling.status === 'shorts_scripting' ? 'Drafting Viral Shorts...' :
                                 selectedFiling.status === 'audio_generating' ? 'Generating AI Audio...' :
                                 'Rendering Video Short...'}
                              </h4>
                              <p className="text-xs text-slate-500 mb-3">
                                {selectedFiling.status === 'video_rendering' 
                                  ? 'Creating the visual frames and syncing audio. This takes about a minute.'
                                  : 'The summary is ready below. Media will appear here shortly.'}
                              </p>
                              <ProgressBar 
                                current={selectedFiling.currentStep} 
                                total={selectedFiling.totalSteps} 
                                label={selectedFiling.status === 'podcast_scripting' ? 'Script Beats' : 
                                       selectedFiling.status === 'audio_generating' ? 'Dialogue Turns' : 
                                       'Progress'} 
                              />
                            </div>
                          </div>
                        );
                      })()
                    )}

                    {/* Audio Player / Cover Section */}
                    <div className="relative group overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
                      {/* Atmospheric Background */}
                      <div className="absolute inset-0 opacity-40">
                        <img 
                          src={`https://picsum.photos/seed/${selectedFiling.ticker}-podcast/1200/600?blur=10`}
                          className="w-full h-full object-cover"
                          alt=""
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />
                      </div>

                      <div className="relative p-8 flex flex-col md:flex-row gap-8 items-center">
                        {/* Podcast Cover Art */}
                        <div className="w-48 h-48 flex-shrink-0 relative group/cover">
                          <img 
                            src={`https://picsum.photos/seed/${selectedFiling.ticker}-art/600/600`}
                            className="w-full h-full object-cover rounded-xl shadow-2xl transition-transform duration-500 group-hover/cover:scale-105"
                            alt="Podcast Cover"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 ring-1 ring-inset ring-white/20 rounded-xl" />
                          <div className="absolute -bottom-2 -right-2 bg-blue-600 p-3 rounded-full shadow-xl">
                            <Play className="w-6 h-6 text-white fill-current" />
                          </div>
                        </div>

                        <div className="flex-1 text-center md:text-left">
                          <div className="flex items-center gap-2 mb-2 justify-center md:justify-start">
                            <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-widest rounded border border-blue-500/30">Podcast Episode</span>
                            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">• 12 min read</span>
                          </div>
                          <h2 className="text-3xl font-display font-bold text-white mb-2 leading-tight">
                            The {selectedFiling.ticker} Breakdown: <span className="italic font-normal text-slate-400">
                              Inside the {getHumanFormType(selectedFiling.formType)}
                              {selectedFiling.periodEndDate && ` (Ended ${new Date(selectedFiling.periodEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`}
                            </span>
                          </h2>
                          <p className="text-slate-400 text-sm font-serif italic mb-6 max-w-xl">
                            A deep-dive conversation exploring the strategic shifts and financial health of {selectedFiling.ticker} based on their latest SEC filing.
                          </p>

                          {selectedFiling.audioBase64 && selectedFiling.audioBase64.length > 100 ? (
                            <div className="glass-card p-4 flex items-center gap-4">
                              <audio 
                                controls 
                                onPlay={() => {
                                  if (videoRef.current) videoRef.current.pause();
                                  if (activeAudio) {
                                    activeAudio.pause();
                                    setActiveAudio(null);
                                  }
                                  setPlayingType('podcast');
                                }}
                                onPause={() => setPlayingType(null)}
                                onEnded={() => setPlayingType(null)}
                                className="w-full h-8 accent-blue-500"
                                src={`data:audio/wav;base64,${selectedFiling.audioBase64}`}
                              />
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center gap-2 text-amber-500 text-xs font-bold uppercase tracking-wider">
                                <Volume2 className="w-4 h-4" />
                                {['podcast_scripting', 'audio_generating'].includes(selectedFiling.status) 
                                  ? 'Background Generation in Progress' 
                                  : 'Cloud Audio Pending'}
                              </div>
                              <button 
                                onClick={() => playConversation(selectedFiling)}
                                disabled={isGeneratingPodcast || !selectedFiling.podcastScript || ['podcast_scripting', 'audio_generating'].includes(selectedFiling.status)}
                                className={`${playingType === 'podcast' ? 'bg-red-600 hover:bg-red-500' : 'bg-white hover:bg-slate-200'} text-slate-950 text-xs font-bold py-3 px-6 rounded-full transition-all flex items-center gap-2 w-fit shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
                              >
                                {isGeneratingPodcast || ['podcast_scripting', 'audio_generating'].includes(selectedFiling.status) ? (
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                ) : playingType === 'podcast' ? (
                                  <Square className="w-4 h-4 fill-current" />
                                ) : (
                                  <Play className="w-4 h-4 fill-current" />
                                )}
                                {isGeneratingPodcast || selectedFiling.status === 'audio_generating' 
                                  ? 'Generating Audio...' 
                                  : selectedFiling.status === 'podcast_scripting'
                                  ? 'Drafting Script...'
                                  : playingType === 'podcast' ? 'Stop Playback' : 'Play Human Conversation'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Summary */}
                    <section className="glass-card p-8">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="h-px flex-1 bg-slate-800" />
                        <h3 className="text-lg font-display font-bold text-white uppercase tracking-[0.2em] text-[10px]">Executive Summary</h3>
                        <div className="h-px flex-1 bg-slate-800" />
                      </div>
                      <div className="markdown-body prose prose-invert max-w-none">
                        <ReactMarkdown>{selectedFiling.summary || ''}</ReactMarkdown>
                      </div>
                    </section>

                    {/* Video Short Section */}
                    {selectedFiling.shortsScript && (
                      <section>
                        <div className="flex items-center gap-2 mb-6">
                          <h3 className="text-lg font-display font-bold text-white uppercase tracking-[0.2em] text-[10px]">
                            Viral Short: {getHumanFormType(selectedFiling.formType)} 
                            {selectedFiling.periodEndDate && ` (${new Date(selectedFiling.periodEndDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})`}
                          </h3>
                          <div className="h-px flex-1 bg-slate-800" />
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {/* Short Media Container */}
                          <div className="aspect-[9/16] max-w-[300px] mx-auto relative rounded-3xl overflow-hidden shadow-2xl border border-white/10 group bg-black">
                            {selectedFiling.videoPath && selectedFiling.videoPath.length > 5 ? (
                              <video 
                                ref={videoRef}
                                src={selectedFiling.videoPath}
                                controls
                                onPlay={() => {
                                  if (activeAudio) {
                                    activeAudio.pause();
                                    setActiveAudio(null);
                                  }
                                  setPlayingType('video');
                                }}
                                onPause={() => setPlayingType(null)}
                                onEnded={() => setPlayingType(null)}
                                className="w-full h-full object-cover"
                                poster={`https://picsum.photos/seed/${selectedFiling.ticker}-shorts/900/1600`}
                              />
                            ) : (
                              <>
                                <motion.img 
                                  initial={{ scale: 1.1 }}
                                  animate={{ scale: 1 }}
                                  transition={{ duration: 10, repeat: Infinity, repeatType: "reverse" }}
                                  src={`https://picsum.photos/seed/${selectedFiling.ticker}-shorts/900/1600`}
                                  className="w-full h-full object-cover"
                                  alt="Shorts Cover"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />
                                
                                {/* Overlay Text */}
                                <div className="absolute inset-0 p-6 flex flex-col justify-between items-center text-center">
                                  <motion.div 
                                    initial={{ y: -20, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/20 text-[10px] font-bold text-white uppercase tracking-widest"
                                  >
                                    {selectedFiling.ticker} Insight
                                  </motion.div>
                                  
                                  <div className="space-y-4">
                                    <motion.h4 
                                      initial={{ scale: 0.8, opacity: 0 }}
                                      animate={{ scale: 1, opacity: 1 }}
                                      transition={{ delay: 0.2 }}
                                      className="text-2xl font-display font-black text-white leading-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] uppercase"
                                    >
                                      {(() => {
                                        try {
                                          const script = JSON.parse(selectedFiling.shortsScript || '{}');
                                          return script.visualText1 || "Market Alert";
                                        } catch (e) { return "Market Alert"; }
                                      })()}
                                    </motion.h4>
                                    <motion.div 
                                      initial={{ width: 0 }}
                                      animate={{ width: 48 }}
                                      className="h-1 bg-blue-500 mx-auto rounded-full" 
                                    />
                                  </div>

                                  <div className="w-full">
                                    {selectedFiling.shortsAudioBase64 && selectedFiling.shortsAudioBase64.length > 100 ? (
                                      <div className="bg-white/10 backdrop-blur-xl p-2 rounded-2xl border border-white/20">
                                        <audio 
                                          controls 
                                          onPlay={() => {
                                            if (videoRef.current) videoRef.current.pause();
                                            if (activeAudio) {
                                              activeAudio.pause();
                                              setActiveAudio(null);
                                            }
                                            setPlayingType('short');
                                          }}
                                          onPause={() => setPlayingType(null)}
                                          onEnded={() => setPlayingType(null)}
                                          className="w-full h-6 accent-blue-500"
                                          src={`data:audio/wav;base64,${selectedFiling.shortsAudioBase64}`}
                                        />
                                      </div>
                                    ) : (
                                      <button 
                                        onClick={() => playShortVoiceover(selectedFiling)}
                                        disabled={isGeneratingShort || !selectedFiling.shortsScript || ['shorts_scripting', 'audio_generating'].includes(selectedFiling.status)}
                                        className={`w-full ${playingType === 'short' ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-white text-slate-950 hover:bg-slate-200'} py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                                      >
                                        {isGeneratingShort || ['shorts_scripting', 'audio_generating'].includes(selectedFiling.status) ? (
                                          <RefreshCw className="w-4 h-4 animate-spin" />
                                        ) : playingType === 'short' ? (
                                          <Square className="w-4 h-4 fill-current" />
                                        ) : (
                                          <Play className="w-4 h-4 fill-current" />
                                        )}
                                        {isGeneratingShort || selectedFiling.status === 'audio_generating' 
                                          ? 'Generating Audio...' 
                                          : selectedFiling.status === 'shorts_scripting'
                                          ? 'Drafting Script...'
                                          : playingType === 'short' ? 'Stop' : 'Play Human Voiceover'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Script Content */}
                          <div className="flex flex-col justify-center space-y-6">
                            <div className="space-y-2">
                              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-[0.2em]">The Narrative</span>
                              <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 relative">
                                <div className="absolute -top-3 -left-3 text-slate-700">
                                  <FileText className="w-8 h-8 opacity-20" />
                                </div>
                                <p className="text-slate-300 font-serif italic text-lg leading-relaxed relative z-10">
                                  "{(() => {
                                    try {
                                      const script = JSON.parse(selectedFiling.shortsScript);
                                      return script.shortsScript || selectedFiling.shortsScript;
                                    } catch (e) { return selectedFiling.shortsScript; }
                                  })()}"
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                              <div className="flex items-center gap-3 text-xs text-slate-500">
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                <span>Visual Hook: <span className="text-slate-300 font-bold uppercase tracking-wider ml-1">
                                  {(() => {
                                    try {
                                      const script = JSON.parse(selectedFiling.shortsScript);
                                      return script.visualText1;
                                    } catch (e) { return "N/A"; }
                                  })()}
                                </span></span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-500">
                                <div className="w-2 h-2 rounded-full bg-purple-500" />
                                <span>Key Visual: <span className="text-slate-300 font-bold uppercase tracking-wider ml-1">
                                  {(() => {
                                    try {
                                      const script = JSON.parse(selectedFiling.shortsScript);
                                      return script.visualText2;
                                    } catch (e) { return "N/A"; }
                                  })()}
                                </span></span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>
                    )}

                    {/* Podcast Script Section */}
                    {selectedFiling.podcastScript && (
                      <section className="glass-card p-8">
                        <div className="flex items-center gap-4 mb-8">
                          <h3 className="text-lg font-display font-bold text-white uppercase tracking-[0.2em] text-[10px]">The Dialogue</h3>
                          <div className="h-px flex-1 bg-slate-800" />
                        </div>
                        <div className="space-y-8 max-w-3xl mx-auto">
                          {(() => {
                            try {
                              const script = JSON.parse(selectedFiling.podcastScript);
                              if (!Array.isArray(script)) return null;
                              return script.map((turn: any, idx: number) => (
                                <div key={idx} className={`flex gap-6 ${turn.speaker === 'Moderator' ? 'flex-row' : 'flex-row-reverse'}`}>
                                  <div className="flex-shrink-0 flex flex-col items-center gap-2">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold shadow-xl rotate-3 ${turn.speaker === 'Moderator' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200 -rotate-3'}`}>
                                      {turn.speaker[0]}
                                    </div>
                                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">{turn.speaker}</span>
                                  </div>
                                  <div className={`flex-1 p-5 rounded-3xl text-base leading-relaxed shadow-sm border ${
                                    turn.speaker === 'Moderator' 
                                      ? 'bg-slate-800/50 border-slate-700 text-slate-200 rounded-tl-none' 
                                      : 'bg-slate-900/80 border-slate-800 text-white rounded-tr-none font-serif italic'
                                  }`}>
                                    {turn.text}
                                  </div>
                                </div>
                              ));
                            } catch (e) {
                              return <p className="text-slate-500 italic text-sm">Script format error</p>;
                            }
                          })()}
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[600px] flex flex-col items-center justify-center bg-slate-900/30 border border-dashed border-slate-800 rounded-xl text-slate-600">
              <FileText className="w-16 h-16 mb-4 opacity-20" />
              <p>Select a filing to view AI-powered insights</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
