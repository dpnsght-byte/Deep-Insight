import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Shield, Search, RefreshCw, AlertCircle, CheckCircle2, Eraser } from 'lucide-react';
import { Ticker } from '../types';

const Admin: React.FC = () => {
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [newSymbol, setNewSymbol] = useState('');
  const [generatePodcast, setGeneratePodcast] = useState(false);
  const [generateShorts, setGenerateShorts] = useState(true);
  const [voiceModel, setVoiceModel] = useState<'studio' | 'neural'>('studio');
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState<{
    keyDetected: boolean;
    keySource: string;
    keyLength: number;
    isPlaceholder: boolean;
    isSuspendedFallback: boolean;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [wiping, setWiping] = useState(false);

  useEffect(() => {
    const fetchTickers = async () => {
      try {
        const [tickersRes, statusRes] = await Promise.all([
          fetch('/api/tickers'),
          fetch('/api/admin/status')
        ]);
        
        if (tickersRes.ok) {
          const data = await tickersRes.json();
          setTickers(data);
          setError(null);
        }
        
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setApiStatus(statusData);
        }
      } catch (err: any) {
        console.error("Failed to fetch tickers:", err);
        setError("Connection error: The server might be restarting. Please wait a moment.");
      } finally {
        setLoading(false);
      }
    };

    fetchTickers();
    const interval = setInterval(fetchTickers, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAddTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // Check for duplicates locally first
      if (tickers.some(t => t.symbol === newSymbol.toUpperCase())) {
        throw new Error(`Ticker ${newSymbol.toUpperCase()} is already being monitored.`);
      }

      const response = await fetch('/api/tickers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          symbol: newSymbol.toUpperCase(),
          generatePodcast: generatePodcast ? 1 : 0,
          generateShorts: generateShorts ? 1 : 0,
          voiceModel: voiceModel
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add ticker');
      }

      setSuccess(`Successfully registered ${newSymbol.toUpperCase()}. The SEC Watcher will scan for new filings within the next 10 minutes.`);
      setNewSymbol('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDeleteTicker = async (id: string) => {
    try {
      const response = await fetch(`/api/tickers/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete ticker');
      setDeleteConfirmId(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleWipeDatabase = async () => {
    if (!window.confirm("Are you absolutely sure you want to wipe ALL tickers and filings? This cannot be undone.")) return;
    
    setWiping(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/wipe', { method: 'POST' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to wipe database');
      }
      setSuccess("Database wiped successfully.");
    } catch (err: any) {
      setError(`Wipe failed: ${err.message}`);
    } finally {
      setWiping(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center gap-4 mb-8">
        <div className="bg-blue-600/20 p-3 rounded-xl">
          <Shield className="w-8 h-8 text-blue-500" />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-white">System Administration</h2>
          <p className="text-slate-400">Manage monitored tickers and system configuration.</p>
        </div>
      </div>
      
      {/* API Health Status */}
      {apiStatus && (
        <div className={`p-4 rounded-xl border ${
          (apiStatus.isSuspendedFallback || apiStatus.isPlaceholder || apiStatus.keyLength < 30)
            ? 'bg-red-500/10 border-red-500/50 text-red-400'
            : 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400'
        }`}>
          <div className="flex items-center gap-3">
            { (apiStatus.isSuspendedFallback || apiStatus.isPlaceholder || apiStatus.keyLength < 30) ? (
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-6 h-6 flex-shrink-0" />
            )}
            <div className="flex-1">
              <h4 className="font-bold flex items-center gap-2">
                Gemini API: { (apiStatus.isSuspendedFallback || apiStatus.isPlaceholder || apiStatus.keyLength < 30) ? 'Action Required' : 'Healthy' }
                <span className="text-xs font-mono opacity-50 px-2 py-0.5 rounded bg-white/5 uppercase">
                  Source: {apiStatus.keySource}
                </span>
              </h4>
              <p className="text-sm opacity-80 mt-1">
                {apiStatus.isSuspendedFallback && "The system is using the suspended Firebase fallback key. Please add 'CUSTOM_GEMINI_API_KEY' in Settings."}
                {apiStatus.isPlaceholder && "Current key is a placeholder. Please provide a valid 39-character key."}
                {apiStatus.keyLength < 30 && !apiStatus.isPlaceholder && !apiStatus.isSuspendedFallback && `The key provided is too short (${apiStatus.keyLength} chars). Expected 39 chars.`}
                {!apiStatus.isSuspendedFallback && !apiStatus.isPlaceholder && apiStatus.keyLength >= 30 && "The system is correctly configured with your individual API key."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add Ticker Form */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-xl">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-blue-500" />
          Add New Ticker
        </h3>
        <form onSubmit={handleAddTicker} className="space-y-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                type="text"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                placeholder="Enter Ticker Symbol (e.g., AAPL, MSFT)"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                disabled={submitting}
              />
            </div>
            <button
              type="submit"
              disabled={submitting || !newSymbol.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-3 px-8 rounded-lg transition-all flex items-center gap-2"
            >
              {submitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
              Add Ticker
            </button>
          </div>

          <div className="flex gap-6 px-2">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={generatePodcast}
                onChange={(e) => setGeneratePodcast(e.target.checked)}
                className="w-5 h-5 rounded border-slate-800 bg-slate-950 text-blue-600 focus:ring-blue-500/50 focus:ring-offset-slate-900 transition-all"
              />
              <span className="text-sm text-slate-300 group-hover:text-white transition-colors">Generate Audio Podcast</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={generateShorts}
                onChange={(e) => setGenerateShorts(e.target.checked)}
                className="w-5 h-5 rounded border-slate-800 bg-slate-950 text-blue-600 focus:ring-blue-500/50 focus:ring-offset-slate-900 transition-all"
              />
              <span className="text-sm text-slate-300 group-hover:text-white transition-colors">Generate 30s Video Short</span>
            </label>
          </div>

          <div className="flex flex-col gap-2 px-2 pt-2 border-t border-slate-800/50">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Podcast Voice Engine</span>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="radio"
                  name="voiceModel"
                  value="studio"
                  checked={voiceModel === 'studio'}
                  onChange={() => setVoiceModel('studio')}
                  className="w-4 h-4 border-slate-800 bg-slate-950 text-blue-600 focus:ring-blue-500/50"
                />
                <div className="flex flex-col">
                  <span className="text-sm text-slate-300 group-hover:text-white transition-colors">Studio Voices (High Fidelity)</span>
                  <span className="text-[10px] text-slate-500">Professional, polished, and clear. Best for long-form.</span>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="radio"
                  name="voiceModel"
                  value="neural"
                  checked={voiceModel === 'neural'}
                  onChange={() => setVoiceModel('neural')}
                  className="w-4 h-4 border-slate-800 bg-slate-950 text-blue-600 focus:ring-blue-500/50"
                />
                <div className="flex flex-col">
                  <span className="text-sm text-slate-300 group-hover:text-white transition-colors">Neural Voices (Expressive)</span>
                  <span className="text-[10px] text-slate-500">Snappy and energetic. Good for banter.</span>
                </div>
              </label>
            </div>
          </div>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-900/20 border border-red-900/50 rounded-lg flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 p-3 bg-green-900/20 border border-green-900/50 rounded-lg flex items-center gap-2 text-green-400 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            {success}
          </div>
        )}
      </div>

      {/* Tickers List */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-white">Monitored Tickers</h3>
          <div className="flex items-center gap-4">
            <button
              onClick={handleWipeDatabase}
              disabled={wiping}
              className="flex items-center gap-2 text-xs font-bold text-red-500 hover:text-red-400 disabled:text-slate-700 transition-colors uppercase tracking-wider"
            >
              {wiping ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Eraser className="w-3 h-3" />}
              Wipe Database
            </button>
            <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">{tickers.length} Active</span>
          </div>
        </div>
        <div className="divide-y divide-slate-800">
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p>Loading tickers...</p>
            </div>
          ) : tickers.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <p>No tickers are currently being monitored.</p>
            </div>
          ) : (
            tickers.map((ticker) => (
              <div key={ticker.id} className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="bg-slate-800 w-12 h-12 rounded-lg flex items-center justify-center font-bold text-blue-400 text-lg">
                    {ticker.symbol}
                  </div>
                  <div>
                    <h4 className="text-white font-medium">{ticker.symbol}</h4>
                    <div className="flex gap-2 mt-1">
                      {ticker.generatePodcast === 1 && (
                        <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">Podcast</span>
                      )}
                      {ticker.generateShorts === 1 && (
                        <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded border border-purple-500/20">Video</span>
                      )}
                      <span className={`text-[10px] px-2 py-0.5 rounded border ${
                        ticker.voiceModel === 'neural' 
                          ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' 
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}>
                        {ticker.voiceModel === 'neural' ? 'Neural Engine' : 'Studio Engine'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">Added on {new Date(ticker.addedAt).toLocaleDateString()}</p>
                  </div>
                </div>
                {deleteConfirmId === ticker.id ? (
                  <div className="flex items-center gap-3 bg-red-900/20 p-2 rounded-lg border border-red-900/50">
                    <span className="text-xs text-red-400 font-medium">Delete ticker and all filings?</span>
                    <button
                      onClick={() => handleDeleteTicker(ticker.id)}
                      className="bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold py-1 px-3 rounded uppercase transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="text-slate-400 hover:text-white text-[10px] font-bold py-1 px-3 uppercase transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmId(ticker.id)}
                    className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Admin;
