// Force restart with new project ID: leafy-bond-493102-v8
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import * as dotenv from "dotenv";
import cors from "cors";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { createCanvas, loadImage } from "canvas";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { VertexAI } from "@google-cloud/vertexai";
import textToSpeech from '@google-cloud/text-to-speech';
import { initializeApp as initializeAdminApp, getApps } from "firebase-admin/app";
import { MediaEngine } from "./MediaEngine";
import * as cheerio from "cheerio";

import Database from "better-sqlite3";

dotenv.config();

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const DISTRIBUTOR_URL = process.env.DISTRIBUTOR_URL || 'http://localhost:3001';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'deep-insight-secret-123';

const logFile = path.join(process.cwd(), "server_sqlite.log");

const log = (msg: string) => {
  const timestamp = new Date().toISOString();
  const formattedMsg = `[${timestamp}] ${msg}`;
  console.log(formattedMsg);
  try {
    fs.appendFileSync(logFile, formattedMsg + "\n");
  } catch (err) {}
};

// Initialize SQLite with Recovery
const dbPath = path.join(process.cwd(), "data.db");
const backupPath = path.join(process.cwd(), "data.db.bak");

function initializeDatabase() {
  let db: Database.Database;
  
  try {
    db = new Database(dbPath);
    // Run a quick integrity check
    const check = db.pragma('integrity_check') as any;
    if (check[0].integrity_check !== 'ok') {
      throw new Error("Integrity check failed");
    }
    log("[SQLITE] Database initialized and healthy.");
  } catch (err: any) {
    log(`[SQLITE] Database corruption detected or error opening: ${err.message}`);
    if (fs.existsSync(backupPath)) {
      log("[SQLITE] Attempting recovery from backup...");
      try {
        fs.copyFileSync(backupPath, dbPath);
        db = new Database(dbPath);
        log("[SQLITE] Recovery successful.");
      } catch (recoveryErr: any) {
        log(`[SQLITE] Recovery failed: ${recoveryErr.message}. Starting fresh.`);
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        db = new Database(dbPath);
      }
    } else {
      log("[SQLITE] No backup found. Starting fresh.");
      db = new Database(dbPath);
    }
  }
  
  // Enable WAL mode for better concurrency and robustness
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('busy_timeout = 10000');
  
  return db;
}

const sqlite = initializeDatabase();

function backupDatabase() {
  try {
    log("[SQLITE] Creating database backup...");
    sqlite.backup(backupPath)
      .then(() => log("[SQLITE] Backup completed successfully."))
      .catch(err => log(`[SQLITE] Backup failed: ${err.message}`));
  } catch (err: any) {
    log(`[SQLITE] Backup error: ${err.message}`);
  }
}

// Initialize Storage Directories
const STORAGE_DIR = path.join(process.cwd(), "storage");
const AUDIO_DIR = path.join(STORAGE_DIR, "audio");
const SHORTS_DIR = path.join(STORAGE_DIR, "shorts");
const CONTENT_DIR = path.join(STORAGE_DIR, "content");

[STORAGE_DIR, AUDIO_DIR, SHORTS_DIR, CONTENT_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const saveStorageFile = (type: 'audio' | 'shorts' | 'content', id: string, data: string) => {
  const dir = type === 'audio' ? AUDIO_DIR : (type === 'shorts' ? SHORTS_DIR : CONTENT_DIR);
  const ext = type === 'content' ? '.txt' : '.wav';
  const filePath = path.join(dir, `${id}${ext}`);
  fs.writeFileSync(filePath, data);
  return `${id}${ext}`;
};

const getStorageFile = (type: 'audio' | 'shorts' | 'content', filename: string) => {
  if (!filename) return null;
  const dir = type === 'audio' ? AUDIO_DIR : (type === 'shorts' ? SHORTS_DIR : CONTENT_DIR);
  const filePath = path.join(dir, filename);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  return null;
};

// Initialize Media Engine
MediaEngine.init();

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS tickers (
    id TEXT PRIMARY KEY,
    symbol TEXT UNIQUE,
    name TEXT,
    addedAt TEXT,
    addedBy TEXT,
    generatePodcast INTEGER DEFAULT 0,
    generateShorts INTEGER DEFAULT 1,
    voiceModel TEXT DEFAULT 'studio'
  );
  CREATE TABLE IF NOT EXISTS filings (
    id TEXT PRIMARY KEY,
    ticker TEXT,
    formType TEXT,
    filingDate TEXT,
    accessionNumber TEXT,
    url TEXT,
    rawContent TEXT,
    summary TEXT,
    podcastScript TEXT,
    shortsScript TEXT,
    audioBase64 TEXT,
    shortsAudioBase64 TEXT,
    videoPath TEXT,
    status TEXT,
    error TEXT,
    createdAt TEXT,
    companyName TEXT,
    processingStartedAt TEXT,
    currentStep INTEGER DEFAULT 0,
    totalSteps INTEGER DEFAULT 0,
    periodEndDate TEXT
  );
`);

// Migrations
try {
  sqlite.prepare("ALTER TABLE filings ADD COLUMN videoPath TEXT").run();
} catch (e) {}
try {
  sqlite.prepare("ALTER TABLE filings ADD COLUMN processingStartedAt TEXT").run();
} catch (e) {}
try {
  sqlite.prepare("ALTER TABLE filings ADD COLUMN currentStep INTEGER DEFAULT 0").run();
} catch (e) {}
try {
  sqlite.prepare("ALTER TABLE filings ADD COLUMN totalSteps INTEGER DEFAULT 0").run();
} catch (e) {}
try {
  sqlite.prepare("ALTER TABLE filings ADD COLUMN periodEndDate TEXT").run();
} catch (e) {}
try {
  sqlite.prepare("ALTER TABLE tickers ADD COLUMN voiceModel TEXT DEFAULT 'studio'").run();
} catch (e) {}

try {
  sqlite.prepare("ALTER TABLE filings ADD COLUMN companyName TEXT").run();
} catch (e) {}

// Seed default tickers if empty
try {
  const tickerCount = sqlite.prepare("SELECT COUNT(*) as count FROM tickers").get() as any;
  if (tickerCount.count === 0) {
    log("[SQLITE] Database is empty. Seeding default tickers (NFLX, CRM, META)...");
    const defaults = ['NFLX', 'CRM', 'META'];
    for (const symbol of defaults) {
      const id = Math.random().toString(36).substring(2, 11);
      sqlite.prepare(`
        INSERT INTO tickers (id, symbol, addedAt, addedBy, generatePodcast, generateShorts, voiceModel)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, symbol, new Date().toISOString(), "system", 1, 1, 'studio');
    }
  }
} catch (err: any) {
  console.error("[SQLITE] Seeding error:", err.message);
}

// Load Firebase Config
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), "firebase-applet-config.json"), "utf8"));

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

// Initialize Media Engine
MediaEngine.init();

function wrapPcmInWav(pcmBuffer: Buffer, sampleRate: number = 24000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const header = Buffer.alloc(headerSize);
  header.write("RIFF", 0);
  header.writeUInt32LE(totalSize - 8, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Chunk size
  header.writeUInt16LE(1, 20); // Audio format (PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let lastGeminiCallTime = 0;
const MIN_GEMINI_INTERVAL = 6000; // 6 seconds between calls (10 RPM) to be safe

async function callGeminiWithRetry(ai: any, modelNameOrPrompt: string, prompt?: string, retries = 5, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      // Rate limiting: Ensure minimum interval between calls
      const now = Date.now();
      const timeSinceLastCall = now - lastGeminiCallTime;
      if (timeSinceLastCall < MIN_GEMINI_INTERVAL) {
        const waitTime = MIN_GEMINI_INTERVAL - timeSinceLastCall;
        await sleep(waitTime);
      }
      lastGeminiCallTime = Date.now();

      if (prompt === undefined) {
        // Vertex AI SDK (only 2 args passed in fallback)
        const result = await ai.generateContent({
          contents: [{ role: 'user', parts: [{ text: modelNameOrPrompt }] }]
        });
        const response = await result.response;
        return response;
      } else {
        // GoogleGenAI SDK (3 args passed)
        const model = ai.getGenerativeModel({ model: modelNameOrPrompt });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response;
      }
    } catch (error: any) {
      if (error.message?.includes("429") || error.status === 429) {
        const backoff = delay * Math.pow(2, i);
        log(`[GEMINI] Rate limited (429). Retrying in ${backoff}ms... (Attempt ${i + 1}/${retries})`);
        await sleep(backoff);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Failed after ${retries} retries due to rate limiting.`);
}

function wrapInSSML(text: string): string {
  // 1. Clean text
  let ssml = text.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[m] || m));

  // 2. Add natural pauses after punctuation
  ssml = ssml.replace(/\. /g, '. <break time="400ms"/> ');
  ssml = ssml.replace(/, /g, ', <break time="150ms"/> ');
  ssml = ssml.replace(/\? /g, '? <break time="500ms"/> ');

  // 3. Randomize prosody slightly to simulate human variation
  const rate = (0.95 + Math.random() * 0.1).toFixed(2); // 0.95 to 1.05
  
  return `<speak><prosody rate="${rate}">${ssml}</prosody></speak>`;
}

function enhanceSSML(text: string, isStudio: boolean = false): string {
  // Escape special characters
  let ssml = text.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[m] || m));

  // 1. Interjections (Pre-recorded human sounds)
  // Note: Studio voices often don't support say-as interjection either
  const interjections: Record<string, string> = {
    'haha': 'ha ha',
    'wow': 'wow',
    'mhm': 'mhm',
    'uh-huh': 'uh-huh',
    'exactly': 'exactly',
    'right': 'right',
    'actually': 'actually',
    'wait': 'wait'
  };

  for (const [key, val] of Object.entries(interjections)) {
    const regex = new RegExp(`\\b${key}\\b`, 'gi');
    if (isStudio) {
      ssml = ssml.replace(regex, val); // Just use the text for Studio
    } else {
      ssml = ssml.replace(regex, `<say-as interpret-as="interjection">${val}</say-as>`);
    }
  }

  // 2. Dynamic Prosody for numbers and financial terms
  // Studio voices don't support 'pitch' attribute
  if (!isStudio) {
    ssml = ssml.replace(/(\$?\d+(?:\.\d+)?\s*(?:billion|million|B|M|%))/g, '<prosody pitch="+1st" volume="+1dB">$1</prosody>');
  } else {
    ssml = ssml.replace(/(\$?\d+(?:\.\d+)?\s*(?:billion|million|B|M|%))/g, '<prosody volume="+1dB">$1</prosody>');
  }

  // 3. Emphasis for "power words"
  // Studio voices don't support <emphasis>
  const powerWords = ['explosive', 'massive', 'critical', 'staggering', 'pivot', 'disruptor', 'powerhouse', 'miracle', 'bombshell', 'stunning'];
  for (const word of powerWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (isStudio) {
      ssml = ssml.replace(regex, word); // No emphasis for Studio
    } else {
      ssml = ssml.replace(regex, `<emphasis level="strong">${word}</emphasis>`);
    }
  }

  // 4. Natural Pauses
  ssml = ssml.replace(/\. /g, '. <break time="450ms"/> ');
  ssml = ssml.replace(/, /g, ', <break time="180ms"/> ');
  ssml = ssml.replace(/\? /g, '? <break time="600ms"/> ');
  ssml = ssml.replace(/\! /g, '! <break time="300ms"/> ');

  // 5. Randomize rate slightly for human feel
  const rate = (0.96 + Math.random() * 0.08).toFixed(2);
  
  return `<speak><prosody rate="${rate}">${ssml}</prosody></speak>`;
}

async function mixWithAmbience(audioBuffer: Buffer, id: string): Promise<Buffer> {
  const tempDir = path.join(process.cwd(), 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  const inputPath = path.join(tempDir, `input_${id}.wav`);
  const outputPath = path.join(tempDir, `output_${id}.wav`);
  fs.writeFileSync(inputPath, audioBuffer);

  return new Promise<Buffer>((resolve, reject) => {
    // Generate subtle brown noise (ambience) and mix it with the input
    // -0.005 amp for very subtle "room tone"
    ffmpeg()
      .input(inputPath)
      .input('anoisesrc=d=3600:c=brown:amp=0.003')
      .inputFormat('lavfi')
      .complexFilter([
        '[0:a]volume=1.0[main]',
        '[1:a]volume=1.0[bg]',
        '[main][bg]amix=inputs=2:duration=first:dropout_transition=0[out]'
      ])
      .map('[out]')
      .audioChannels(1)
      .audioFrequency(24000)
      .save(outputPath)
      .on('end', () => {
        const result = fs.readFileSync(outputPath);
        // Cleanup
        try {
          fs.unlinkSync(inputPath);
          fs.unlinkSync(outputPath);
        } catch (e) {}
        resolve(result);
      })
      .on('error', (err) => {
        log(`[MIXER] Error mixing ambience: ${err.message}`);
        resolve(audioBuffer); // Fallback to original
      });
  });
}

async function callTTSWithRetry(text: string, voiceName: string = 'Kore', voiceModel: 'studio' | 'neural' = 'studio', retries = 3) {
  log(`[TTS] Request: Voice=${voiceName}, Model=${voiceModel}`);
  const genAI = new GoogleGenerativeAI(getBestKey());
  
  for (let i = 0; i < retries; i++) {
    try {
      log(`[TTS] Gemini Attempt ${i + 1} starting...`);
      
      // Try 2.5 flash preview first as it's optimized for TTS, fallback to 3 flash preview
      const modelName = i === 0 ? "gemini-2.5-flash-preview-tts" : "gemini-3-flash-preview";
      const model = genAI.getGenerativeModel({ model: modelName });
      
      // Map voiceName to Gemini voices if possible, or use defaults
      let geminiVoice = voiceName;
      if (voiceModel === 'neural') {
        geminiVoice = voiceName === 'Puck' ? 'Aoede' : 'Fenrir';
      }

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: geminiVoice },
            },
          },
        } as any,
      });

      const response = await result.response;
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        log(`[TTS] Gemini Success (${modelName}).`);
        return base64Audio;
      }
      throw new Error("No audio data in Gemini response");
    } catch (error: any) {
      log(`[TTS] Gemini Attempt ${i + 1} failed: ${error.message}`);
      
      // If we hit quota (429) or other fatal error, try Cloud TTS fallback
      if (error.message?.includes("429") || i === retries - 1) {
        log(`[TTS] Falling back to Cloud Text-to-Speech API (${voiceModel} Voices + SSML)...`);
        try {
          const STUDIO_MAP: Record<string, string> = {
            'Puck': 'en-US-Studio-Q',
            'Charon': 'en-US-Studio-O',
            'Aoede': 'en-US-Neural2-H',
            'Kore': 'en-GB-Neural2-B',
            'Fenrir': 'en-US-Neural2-D'
          };

          const NEURAL_MAP: Record<string, string> = {
            'Puck': 'en-US-Neural2-F',
            'Charon': 'en-US-Neural2-D',
            'Aoede': 'en-US-Neural2-H',
            'Kore': 'en-GB-Neural2-B',
            'Fenrir': 'en-US-Neural2-D'
          };

          const VOICE_MAP = voiceModel === 'neural' ? NEURAL_MAP : STUDIO_MAP;
          
          const apiKey = getTTSKey();
          const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
          
          const ssmlBody = enhanceSSML(text, voiceModel === 'studio');
          
          // Chunking logic
          const chunks: string[] = [];
          const innerSSML = ssmlBody.replace('<speak>', '').replace('</speak>', '');

          if (innerSSML.length > 4000) {
            log(`[TTS] Body too long (${innerSSML.length} bytes), chunking...`);
            const parts = innerSSML.split(/(?<=[.?!])\s+/);
            let currentChunk = "";
            for (const part of parts) {
              if ((currentChunk + part).length > 4000) {
                chunks.push(`<speak>${currentChunk}</speak>`);
                currentChunk = part;
              } else {
                currentChunk += (currentChunk ? " " : "") + part;
              }
            }
            if (currentChunk) chunks.push(`<speak>${currentChunk}</speak>`);
          } else {
            chunks.push(ssmlBody);
          }

          const audioBuffers: Buffer[] = [];
          for (const chunk of chunks) {
            log(`[TTS] Sending chunk (${chunk.length} bytes) to Cloud TTS...`);
            const selectedVoice = VOICE_MAP[voiceName] || 'en-US-Neural2-F';
            const langCode = selectedVoice.split('-').slice(0, 2).join('-');
            
            const ttsResponse = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                input: { ssml: chunk },
                voice: { name: selectedVoice, languageCode: langCode },
                audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
              })
            });

            if (ttsResponse.ok) {
              const data = await ttsResponse.json() as any;
              if (data.audioContent) {
                audioBuffers.push(Buffer.from(data.audioContent, 'base64'));
              }
            } else {
              const errData = await ttsResponse.json() as any;
              log(`[TTS] Cloud TTS API error: ${JSON.stringify(errData)}`);
              throw new Error(`Cloud TTS API error: ${errData.error?.message}`);
            }
          }

          if (audioBuffers.length > 0) {
            log(`[TTS] Cloud TTS Success (SSML Mode, ${chunks.length} chunks).`);
            return Buffer.concat(audioBuffers).toString('base64');
          }
        } catch (ttsErr: any) {
          log(`[TTS] Cloud TTS Fallback failed: ${ttsErr.message}`);
          if (ttsErr.message?.includes("suspended")) {
            throw new Error("API_KEY_SUSPENDED: Your Google Cloud API key has been suspended. Please check your billing or project status.");
          }
        }
      }
      
      if (i < retries - 1) await sleep(2000);
    }
  }
  throw new Error(`Gemini TTS failed after ${retries} retries`);
}

const PROCESS_ID = Math.random().toString(36).substring(2, 8);
log(`[SERVER] Starting up... Process ID: ${PROCESS_ID}, Project: ${firebaseConfig.projectId}`);

const getBestKey = () => {
  const envKey = process.env.CUSTOM_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const fbKey = firebaseConfig.apiKey;
  
  const isValid = (k: string | undefined, name: string) => {
    if (!k || k.length <= 20 || k.includes("YOUR_") || k.includes("DUMMY")) {
      return false;
    }
    return true;
  };

  const envKeyName = process.env.CUSTOM_GEMINI_API_KEY ? "CUSTOM_GEMINI_API_KEY" : (process.env.GEMINI_API_KEY ? "GEMINI_API_KEY" : (process.env.GOOGLE_API_KEY ? "GOOGLE_API_KEY" : "Environment Key"));
  
  const useEnv = isValid(envKey, envKeyName);
  const useFb = !useEnv && isValid(fbKey, "Firebase Config Key");

  const key = useEnv ? envKey : (useFb ? fbKey : "DUMMY_KEY");
  
  if (key !== "DUMMY_KEY") {
    const source = useEnv ? envKeyName : "Firebase Config";
    const masked = key!.substring(0, 6) + "..." + key!.substring(key!.length - 4);
    log(`[AUTH] Gemini Key Source: ${source} (${masked})`);
  } else {
    log(`[AUTH] No valid Gemini key found. Falling back to DUMMY_KEY.`);
  }
  return key!;
};

const getTTSKey = () => {
  const ttsKey = process.env.TTS_API_KEY;
  const isValid = (k: string | undefined) => k && k.length > 20 && !k.includes("YOUR_") && !k.includes("DUMMY");

  if (isValid(ttsKey)) {
    const masked = ttsKey!.substring(0, 6) + "..." + ttsKey!.substring(ttsKey!.length - 4);
    log(`[AUTH] Using Dedicated TTS Key: ${masked}`);
    return ttsKey!;
  }
  
  log(`[AUTH] No valid dedicated TTS key found. Falling back to Gemini key.`);
  return getBestKey();
};

const genAI = new GoogleGenerativeAI(getBestKey());

// Initialize Vertex AI
const vertexAI = new VertexAI({ 
  project: firebaseConfig.projectId, 
  location: 'us-central1' 
});
const vertexModel = vertexAI.getGenerativeModel({ 
  model: 'gemini-3-flash-preview' 
});

if (getBestKey() === "DUMMY_KEY") {
  log("[WARNING] GEMINI_API_KEY is not set. AI features will fail.");
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const oauth2Client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  `${APP_URL}/auth/google/callback`
);

const USER_AGENT = `FinancialMonitor/1.0 (dpnsght@gmail.com)`;

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Serve generated media
app.use("/media", express.static(STORAGE_DIR));
app.use("/temp_media", express.static(path.join(process.cwd(), "temp_media")));

// Request logging middleware
app.use((req, res, next) => {
  if (!req.url.startsWith('/@vite') && !req.url.startsWith('/src')) {
    log(`[HTTP] ${req.method} ${req.url}`);
  }
  next();
});

app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    uptime: process.uptime(),
    keyLength: getBestKey().length,
    keyPrefix: getBestKey().substring(0, 6)
  });
});

app.get("/api/filings", async (req, res) => {
  try {
    const filings = sqlite.prepare("SELECT * FROM filings ORDER BY createdAt DESC LIMIT 50").all() as any[];
    
    // Map file storage back to content for the frontend
    const mappedFilings = filings.map(f => {
      const mapped = { ...f };
      if (f.rawContent && f.rawContent.endsWith('.txt')) {
        mapped.rawContent = getStorageFile('content', f.rawContent);
      }
      if (f.audioBase64 && f.audioBase64.endsWith('.wav')) {
        mapped.audioBase64 = getStorageFile('audio', f.audioBase64);
      }
      if (f.shortsAudioBase64 && f.shortsAudioBase64.endsWith('.wav')) {
        mapped.shortsAudioBase64 = getStorageFile('shorts', f.shortsAudioBase64);
      }
      return mapped;
    });

    res.json(mappedFilings);
  } catch (error: any) {
    log(`Error fetching filings: ${error.message}`);
    res.status(500).json({ error: "Failed to fetch filings" });
  }
});

app.post("/api/tts", async (req, res) => {
  const { text, script, voiceName, filingId, type } = req.body;
  
  try {
    let audioBase64: string;

    if (script && Array.isArray(script)) {
      log(`[API] Generating multi-voice audio for script (${script.length} turns)...`);
      const audioChunks: Buffer[] = [];
      for (const turn of script) {
        const turnVoice = turn.speaker?.toLowerCase().includes('moderator') || turn.speaker?.toLowerCase().includes('host') ? 'Puck' : 'Charon';
        const pcmBase64 = await callTTSWithRetry(turn.text, turnVoice);
        if (pcmBase64) audioChunks.push(Buffer.from(pcmBase64, 'base64'));
        await sleep(500);
      }
      if (audioChunks.length === 0) throw new Error("Failed to generate any audio chunks");
      const pcmBuffer = Buffer.concat(audioChunks);
      audioBase64 = wrapPcmInWav(pcmBuffer).toString('base64');
    } else {
      if (!text) return res.status(400).json({ error: "Text is required" });
      const pcmBase64 = await callTTSWithRetry(text, voiceName || 'Kore');
      const pcmBuffer = Buffer.from(pcmBase64, 'base64');
      const wavBuffer = wrapPcmInWav(pcmBuffer);
      audioBase64 = wavBuffer.toString('base64');
    }

    // If filingId and type are provided, store it in the database
    if (filingId && type) {
      const column = type === 'podcast' ? 'audioBase64' : 'shortsAudioBase64';
      try {
        sqlite.prepare(`UPDATE filings SET ${column} = ? WHERE id = ?`).run(audioBase64, filingId);
        log(`[API] Stored ${type} audio for filing ${filingId}`);
      } catch (dbErr: any) {
        log(`[API] Failed to store audio in DB: ${dbErr.message}`);
      }
    }

    res.json({ audioBase64 });
  } catch (error: any) {
    log(`[API] TTS Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/tickers", async (req, res) => {
  log("[API] GET /api/tickers");
  try {
    const tickers = sqlite.prepare("SELECT * FROM tickers ORDER BY symbol ASC").all();
    res.json(tickers);
  } catch (error: any) {
    log(`[API] ERROR fetching tickers: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/tickers", async (req, res) => {
  const { symbol, generatePodcast, generateShorts, voiceModel } = req.body;
  log(`[API] Received request to add ticker: ${symbol}`);
  if (!symbol) return res.status(400).json({ error: "Symbol required" });
  
  try {
    const upperSymbol = symbol.toUpperCase();
    log(`[API] Checking if ${upperSymbol} exists in SQLite...`);
    const existing = sqlite.prepare("SELECT * FROM tickers WHERE symbol = ?").get(upperSymbol);
    if (existing) {
      log(`[API] Ticker ${upperSymbol} already exists.`);
      return res.status(400).json({ error: "Ticker already exists" });
    }

    const id = Math.random().toString(36).substring(2, 11);
    log(`[API] Inserting ${upperSymbol} into SQLite...`);
    sqlite.prepare(`
      INSERT INTO tickers (id, symbol, addedAt, addedBy, generatePodcast, generateShorts, voiceModel)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, upperSymbol, new Date().toISOString(), "system", generatePodcast ?? 1, generateShorts ?? 1, voiceModel || 'studio');
    
    log(`[API] Successfully added ${upperSymbol} with ID ${id}`);
    res.json({ success: true, id });
  } catch (error: any) {
    log(`[API] ERROR adding ticker ${symbol}: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/tickers/:id", async (req, res) => {
  try {
    const ticker = sqlite.prepare("SELECT * FROM tickers WHERE id = ?").get(req.params.id) as any;
    if (ticker) {
      sqlite.prepare("DELETE FROM filings WHERE ticker = ?").run(ticker.symbol);
      sqlite.prepare("DELETE FROM tickers WHERE id = ?").run(req.params.id);
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/status", (req, res) => {
  const key = getBestKey();
  const isCustom = !!process.env.CUSTOM_GEMINI_API_KEY;
  const isStandardEnv = !!process.env.GEMINI_API_KEY;
  
  res.json({
    keyDetected: key !== "DUMMY_KEY",
    keySource: isCustom ? "CUSTOM_GEMINI_API_KEY" : (isStandardEnv ? "GEMINI_API_KEY" : "Firebase Fallback"),
    keyLength: key.length,
    isPlaceholder: key.includes("YOUR_") || key.includes("DUMMY"),
    isSuspendedFallback: key === firebaseConfig.apiKey // If it's using the FB key, it's likely suspended
  });
});

app.post("/api/admin/wipe", async (req, res) => {
  try {
    log("[ADMIN] Wiping SQLite database...");
    sqlite.prepare("DELETE FROM tickers").run();
    sqlite.prepare("DELETE FROM filings").run();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function getCIK(symbol: string): Promise<string | null> {
  try {
    const response = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": USER_AGENT }
    });
    const data = await response.json() as any;
    for (const key in data) {
      if (data[key].ticker === symbol.toUpperCase()) {
        return data[key].cik_str.toString().padStart(10, '0');
      }
    }
  } catch (err: any) {
    log(`[SEC] CIK lookup error for ${symbol}: ${err.message}`);
  }
  return null;
}

async function checkNewFilings() {
  log("[SQLITE-WORKER] Checking for new SEC filings...");
  try {
    const tickers = sqlite.prepare("SELECT * FROM tickers").all() as any[];
    
    for (const t of tickers) {
      try {
        log(`[SQLITE-SEC] Checking ${t.symbol}...`);
        const cik = await getCIK(t.symbol);
        if (!cik) {
          log(`[SQLITE-SEC] Could not find CIK for ${t.symbol}`);
          continue;
        }

        const response = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
          headers: { "User-Agent": USER_AGENT }
        });
        const data = await response.json() as any;
        
        const recentFilings = data.filings.recent;
        let foundLatest10K = false;
        let foundLatest10Q = false;

        for (let i = 0; i < recentFilings.form.length; i++) {
          if (foundLatest10K && foundLatest10Q) break;

          const formType = recentFilings.form[i];
          if ((formType === "10-Q" && !foundLatest10Q) || (formType === "10-K" && !foundLatest10K)) {
            if (formType === "10-Q") foundLatest10Q = true;
            if (formType === "10-K") foundLatest10K = true;

            const accessionNumber = recentFilings.accessionNumber[i];
            const filingDate = recentFilings.filingDate[i];
            const periodEndDate = recentFilings.reportDate[i];
            const primaryDocument = recentFilings.primaryDocument[i];
            
            // Check if we already have this filing
            const existing = sqlite.prepare("SELECT * FROM filings WHERE accessionNumber = ?").get(accessionNumber);
            if (!existing) {
              log(`[SQLITE-SEC] Found new ${formType} for ${t.symbol} (${accessionNumber})`);
              
              const url = `https://www.sec.gov/Archives/edgar/data/${cik.replace(/^0+/, '')}/${accessionNumber.replace(/-/g, '')}/${primaryDocument}`;
              const id = Math.random().toString(36).substring(2, 11);
              
              sqlite.prepare(`
                INSERT INTO filings (id, ticker, formType, filingDate, accessionNumber, url, rawContent, status, createdAt, periodEndDate)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                id,
                t.symbol,
                formType,
                filingDate,
                accessionNumber,
                url,
                "Content pending fetch...", // We'll fetch the actual content in the processor
                "pending",
                new Date().toISOString(),
                periodEndDate
              );
            }
          }
        }
      } catch (err: any) {
        log(`[SQLITE-SEC] Error checking ${t.symbol}: ${err.message}`);
      }
      await sleep(2000);
    }
  } catch (err: any) {
    log(`[SQLITE-WORKER] Global SEC check error: ${err.message}`);
  }
}

async function startBackgroundWorker() {
  log("[SQLITE-WORKER] Starting background filing processor...");
  
  setInterval(async () => {
    try {
      await checkNewFilings();
    } catch (err: any) {
      log(`[SQLITE-WORKER] SEC check interval error: ${err.message}`);
    }
  }, 600000);
  
  try {
    await checkNewFilings();
  } catch (err: any) {
    log(`[SQLITE-WORKER] Initial SEC check error: ${err.message}`);
  }

  while (true) {
    try {
      // Periodically check for new filings for all monitored tickers
      await checkNewFilings();
      
      log("[SQLITE-WORKER] Querying for pending filings...");
      const pending = sqlite.prepare("SELECT * FROM filings WHERE status = 'pending' LIMIT 1").get() as any;
      
      if (pending) {
        log(`[SQLITE-WORKER] Found pending filing: ${pending.ticker} ${pending.formType}`);
        
        sqlite.prepare("UPDATE filings SET status = ?, currentStep = 0, totalSteps = 5, processingStartedAt = ? WHERE id = ?")
          .run('processing', new Date().toISOString(), pending.id);

        try {
          await processFilingInternal(pending);
        } catch (err: any) {
          let friendlyError = err.message || 'Unknown error';
          const hasCustomKey = !!process.env.CUSTOM_GEMINI_API_KEY;

          if (friendlyError.includes('CONSUMER_SUSPENDED') || friendlyError.includes('suspended')) {
            friendlyError = `API Access Suspended: The current Gemini API key is blocked by Google. ${hasCustomKey ? 'Your CUSTOM_GEMINI_API_KEY may have issues.' : 'Please add a new key in Settings as CUSTOM_GEMINI_API_KEY to resume.'}`;
          } else if (friendlyError.includes('API_KEY_INVALID') || friendlyError.includes('expired')) {
            friendlyError = `API Key Expired/Invalid: Please renew your API key. ${hasCustomKey ? 'Check your CUSTOM_GEMINI_API_KEY in Settings.' : 'Add your new key as CUSTOM_GEMINI_API_KEY in Settings.'}`;
          } else if (friendlyError.includes('API_KEY_SERVICE_BLOCKED')) {
            friendlyError = 'Gemini API is blocked. Please enable the "Generative Language API" in your Google Cloud Console.';
          } else if (friendlyError.includes('BILLING_DISABLED')) {
            friendlyError = 'Vertex AI requires billing. Please enable billing or provide a valid free-tier CUSTOM_GEMINI_API_KEY.';
          } else if (friendlyError.includes('PERMISSION_DENIED')) {
            friendlyError = 'Permission Denied: Ensure your API key is correctly configured and restricted.';
          }
          
          log(`[SQLITE-WORKER] Error processing ${pending.ticker}: ${friendlyError}`);
          sqlite.prepare("UPDATE filings SET status = ?, error = ? WHERE id = ?")
            .run('failed', friendlyError, pending.id);
        }
      } else {
        log("[SQLITE-WORKER] No pending filings found.");
      }
    } catch (err: any) {
      log(`[SQLITE-WORKER] Loop error: ${err.message}`);
    }
    await sleep(60000);
  }
}

async function processFilingInternal(filing: any) {
  log(`[PROCESSOR] Starting multi-agent pipeline for ${filing.ticker}...`);
  
  // Fetch real content if it's pending
  let content = filing.rawContent;
  if (content === "Content pending fetch...") {
    try {
      log(`[PROCESSOR] Fetching real SEC content from ${filing.url}...`);
      const response = await fetch(filing.url, {
        headers: { "User-Agent": USER_AGENT }
      });
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Remove scripts and styles
      $('script, style').remove();
      content = $('body').text().replace(/\s+/g, ' ').trim();
      
      log(`[PROCESSOR] Successfully fetched and parsed ${content.length} characters of content.`);
      const contentFile = saveStorageFile('content', filing.id, content);
      sqlite.prepare("UPDATE filings SET rawContent = ? WHERE id = ?").run(contentFile, filing.id);
    } catch (err: any) {
      log(`[PROCESSOR] Error fetching SEC content: ${err.message}`);
      throw new Error(`Failed to fetch SEC content: ${err.message}`);
    }
  }

  // Get ticker options
  const tickerData = sqlite.prepare("SELECT * FROM tickers WHERE symbol = ?").get(filing.ticker) as any || { generatePodcast: 1, generateShorts: 1 };

  const doPodcast = tickerData.generatePodcast === 1; 
  const doShorts = tickerData.generateShorts === 1;

  const sanitizeJson = (text: string) => {
    try {
      // Remove markdown code blocks
      let cleaned = text.replace(/```json\n?|```/g, "").trim();
      
      // Find the first { or [ and the last } or ]
      const firstBrace = cleaned.indexOf('{');
      const firstBracket = cleaned.indexOf('[');
      const start = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? firstBrace : firstBracket;
      
      const lastBrace = cleaned.lastIndexOf('}');
      const lastBracket = cleaned.lastIndexOf(']');
      const end = (lastBrace !== -1 && (lastBracket === -1 || lastBrace > lastBracket)) ? lastBrace : lastBracket;

      if (start !== -1 && end !== -1) {
        cleaned = cleaned.substring(start, end + 1);
      }

      // Remove trailing commas in arrays/objects which break JSON.parse
      cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
      
      return cleaned;
    } catch (e) {
      log(`[JSON-SANITIZE] Error cleaning text: ${e}`);
      return text;
    }
  };

  const truncatedContent = content.length > 1000000 ? content.substring(0, 1000000) + "\n\n[CONTENT TRUNCATED]" : content;

  log(`[PROCESSOR] Agent 0 (Architect) starting...`);
  sqlite.prepare("UPDATE filings SET status = ?, currentStep = 1, totalSteps = 5 WHERE id = ?").run('architect_working', filing.id);
  
  const architectPrompt = `You are a Senior Equity Research Architect and Sector Expert.

GROUNDING RULE (CRITICAL):
- 80% of your analysis MUST be strictly derived from the provided SEC filing text below. Use exact numbers, management quotes, and specific risk factors.
- 20% of your analysis should use your broader sector expertise to provide context, competitive comparisons (e.g., vs rivals), and industry-wide implications.
- Do not hallucinate. If a number isn't in the text, don't invent it.

Analyze this SEC filing for ${filing.ticker} in the context of its current financial results in comparison to previous, factors specific to the company, broader industry and macroeconomic factors:\n\n${truncatedContent}\n\n
Your goal is to create a "Master Mission Document" (The Analyst's Playbook).
This document must guide subsequent agents to produce:
1. A Deep-Dive Podcast (2500-4000 words) that sounds like a high-energy, fast-paced financial podcast (think 'The Daily' or 'Acquired'). It should feature sharp debate, "aha!" moments, and deep institutional insight—not a dry reading of facts.
2. A Viral 30-second Video Short that captures the most critical market-moving insight.

Incorporate sector-specific drivers, competitive positioning, and long-term strategic moats.

Return a JSON object:
{
  "ticker": "${filing.ticker}",
  "narrative": "The high-stakes institutional story",
  "keyThemes": ["theme 1", "theme 2"],
  "podcastBeats": [
    { "title": "The Hook", "focus": "Market-moving headline and why it matters now" },
    { "title": "The Core Narrative", "focus": "How the company's performance matches or defies the broader sector trend." },
    { "title": "The Numbers", "focus": "Deep dive into margins, FCF, and segment performance" },
    { "title": "The Strategy", "focus": "Management's 'Big Bet' and execution progress" },
    { "title": "The Competitive Moat", "focus": "Strategic positioning vs rivals and barrier to entry" },
    { "title": "The Macro Context", "focus": "Interest rates, geopolitical factors, or regulatory headwinds" },
    { "title": "The Bear Case", "focus": "Critical risks, competitive threats, and tail risks" },
    { "title": "The Verdict", "focus": "Investment thesis and long-term outlook" }
  ], // Generate 3-5 distinct beats to cover 3-5 minutes of audio.
  "shortsHook": "The most explosive insight for a 30s viral clip",
  "sentiment": "bullish/bearish/neutral",
  "companyName": "Legal Company Name from Filing"
}`;

  let architectResult;
  try {
    // Use Gemini 3 for Architect with Grounding
    const architectModel = genAI.getGenerativeModel({ 
      model: "gemini-3-flash-preview",
      tools: [{ googleSearch: {} }] as any
    });
    architectResult = await callGeminiWithRetry(architectModel, architectPrompt);
  } catch (err: any) {
    log(`[PROCESSOR] Architect failed with grounding: ${err.message}. Retrying without...`);
    architectResult = await callGeminiWithRetry(genAI, "gemini-3-flash-preview", architectPrompt);
  }
  
  const missionDoc = JSON.parse(sanitizeJson(architectResult.text()));
  log(`[PROCESSOR] Mission Document created for ${missionDoc.companyName}. Narrative: ${missionDoc.narrative}`);

  // Update companyName in DB
  sqlite.prepare("UPDATE filings SET companyName = ? WHERE id = ?").run(missionDoc.companyName || filing.ticker, filing.id);

  log(`[PROCESSOR] Agent 1 (Analyst) starting...`);
  sqlite.prepare("UPDATE filings SET status = ?, currentStep = 2 WHERE id = ?").run('analyst_working', filing.id);
  const analystPrompt = `You are a Senior Financial Analyst.

GROUNDING RULE (CRITICAL):
- 80% of your analysis MUST be strictly derived from the provided SEC filing.
- 20% should use your broader expertise for context.

Based on the Mission Document: ${JSON.stringify(missionDoc)}, provide a detailed analysis of the filing.
Return a JSON object: { "summary": "markdown summary", "sentiment": "${missionDoc.sentiment}", "keyTakeaways": ${JSON.stringify(missionDoc.keyThemes)} }`;
  
  let analystResult;
  try {
    analystResult = await callGeminiWithRetry(genAI, "gemini-3-flash-preview", analystPrompt);
  } catch (err: any) {
    analystResult = await callGeminiWithRetry(vertexModel, analystPrompt);
  }
  
  const analystText = analystResult.text();
  if (!analystText) throw new Error("Agent 1 failed");
  const analystData = JSON.parse(sanitizeJson(analystText));

  // Update summary immediately
  sqlite.prepare("UPDATE filings SET summary = ? WHERE id = ?").run(analystData.summary, filing.id);

  await sleep(5000);

  let podcastScript: any[] = [];
  if (doPodcast) {
    log(`[PROCESSOR] Agent 2 (Podcast) starting segmented scripting...`);
    sqlite.prepare("UPDATE filings SET status = ?, currentStep = 3, totalSteps = ? WHERE id = ?")
      .run('podcast_scripting', missionDoc.podcastBeats.length, filing.id);
    
    // Segmented Scripting Loop
    let beatIndex = 0;
    for (const beat of missionDoc.podcastBeats) {
      beatIndex++;
      log(`[PROCESSOR] Scripting beat: ${beat.title}...`);
      sqlite.prepare("UPDATE filings SET currentStep = ? WHERE id = ?").run(beatIndex, filing.id);
      const beatPrompt = `Create a segment for a 2-person podcast (Moderator and Analyst) for ${filing.ticker}.
Mission: ${missionDoc.narrative}
Current Beat: ${beat.title} - ${beat.focus}
Previous Context: ${podcastScript.length > 0 ? JSON.stringify(podcastScript.slice(-2)) : "Starting now"}

TONE & STYLE (CRITICAL: MAKE IT SOUND HUMAN, NOT A SCRIPT):
- High-energy, conversational, and fast-paced. 
- Use "Verbal Fillers" naturally: "I mean," "Actually," "Wait," "Right," "Exactly," "Mhm," "So," "Like."
- Include "Micro-Reactions": The Moderator should occasionally interrupt with a quick "Wait, really?" or "That's huge."
- The Analyst should sound like they are explaining this to a friend over coffee, not giving a presentation. Use phrases like "Here's the thing," "If you look at the fine print," "This is where it gets interesting."
- Avoid perfect, clinical sentences. Use sentence fragments and conversational pacing.
- The Moderator should be curious, skeptical, and push the Analyst for "what this actually means for the stock."
- Include rhetorical questions and "verbal italics" to emphasize key numbers.
- It should feel like a high-stakes, unscripted debate between two people who live and breathe the markets.

This segment should be roughly 150-200 words.
Return ONLY a valid JSON object. Do not include any other text.
JSON Structure:
{
  "segmentScript": [
    { "speaker": "Moderator", "text": "..." },
    { "speaker": "Analyst", "text": "..." }
  ]
}`;

      let beatResult;
      try {
        beatResult = await callGeminiWithRetry(genAI, "gemini-3-flash-preview", beatPrompt);
      } catch (err: any) {
        beatResult = await callGeminiWithRetry(vertexModel, beatPrompt);
      }
      
      const beatData = JSON.parse(sanitizeJson(beatResult.text()));
      podcastScript = [...podcastScript, ...beatData.segmentScript];
      
      // Save progress
      sqlite.prepare("UPDATE filings SET podcastScript = ? WHERE id = ?").run(JSON.stringify(podcastScript), filing.id);
      await sleep(5000);
    }
  }

  await sleep(5000);

  let shortsData = { shortsScript: "", visualText1: "", visualText2: "", visualText3: "" };
  if (doShorts) {
    log(`[PROCESSOR] Agent 3 (Shorts) starting...`);
    sqlite.prepare("UPDATE filings SET status = ?, currentStep = 1, totalSteps = 1 WHERE id = ?").run('shorts_scripting', filing.id);
    const shortsPrompt = `Create a 30-second viral short script based on this Mission: ${JSON.stringify(missionDoc)}. 
Hook: ${missionDoc.shortsHook}

CONSTRAINTS:
- Duration: EXACTLY 25-30 seconds.
- Word count: Approx 70-85 words.
- Pacing: High-energy, rapid-fire.

Return JSON: { "shortsScript": "...", "visualText1": "...", "visualText2": "...", "visualText3": "..." }`;
    
    let shortsResult;
    try {
      shortsResult = await callGeminiWithRetry(genAI, "gemini-3-flash-preview", shortsPrompt);
    } catch (err: any) {
      shortsResult = await callGeminiWithRetry(vertexModel, shortsPrompt);
    }
    
    const shortsText = shortsResult.text();
    if (!shortsText) throw new Error("Agent 3 failed");
    shortsData = JSON.parse(sanitizeJson(shortsText));

    // Save shorts script immediately
    sqlite.prepare("UPDATE filings SET shortsScript = ? WHERE id = ?").run(JSON.stringify(shortsData), filing.id);
  }

  await sleep(10000);

  log(`[PROCESSOR] Generating audio...`);
  sqlite.prepare("UPDATE filings SET status = ?, currentStep = 0, totalSteps = ? WHERE id = ?")
    .run('audio_generating', podcastScript.length, filing.id);
  
  const tickerSettings = sqlite.prepare("SELECT voiceModel FROM tickers WHERE symbol = ?").get(filing.ticker) as any || { voiceModel: 'studio' };
  const voiceModel = tickerSettings.voiceModel || 'studio';

  let audioBase64 = null;
  let shortsAudioBase64 = null;

  try {
    if (doPodcast && podcastScript.length > 0) {
      const audioChunks: Buffer[] = [];
      // Create a small 100ms silence buffer to prevent clicking (24kHz, 16-bit, mono)
      const silenceBuffer = Buffer.alloc(2400 * 2, 0); 

      for (let i = 0; i < podcastScript.length; i++) {
        sqlite.prepare("UPDATE filings SET currentStep = ? WHERE id = ?").run(i + 1, filing.id);
        const turn = podcastScript[i];
        const turnVoice = turn.speaker?.toLowerCase().includes('moderator') || turn.speaker?.toLowerCase().includes('host') ? 'Puck' : 'Charon';
        const audioContent = await callTTSWithRetry(turn.text, turnVoice, voiceModel);
        if (audioContent) {
          audioChunks.push(Buffer.from(audioContent, 'base64'));
          // Add a tiny bit of silence between turns to prevent clicking and sound more natural
          audioChunks.push(silenceBuffer);
        }
        await sleep(1500);
      }
      if (audioChunks.length > 0) {
        const pcmBuffer = Buffer.concat(audioChunks);
        const wavBuffer = wrapPcmInWav(pcmBuffer);
        
        log(`[PROCESSOR] Mixing podcast with studio ambience...`);
        const mixedBuffer = await mixWithAmbience(wavBuffer, filing.id);
        const audioFile = saveStorageFile('audio', filing.id, mixedBuffer.toString('base64'));
        audioBase64 = audioFile;
      }
    }

    await sleep(3000);

    if (doShorts && shortsData.shortsScript) {
      const pcmBase64 = await callTTSWithRetry(shortsData.shortsScript, 'Aoede');
      if (pcmBase64) {
        const pcmBuffer = Buffer.from(pcmBase64, 'base64');
        const wavBuffer = wrapPcmInWav(pcmBuffer);
        const shortsFile = saveStorageFile('shorts', filing.id, wavBuffer.toString('base64'));
        shortsAudioBase64 = shortsFile;
      }
    }

    // Generate Video if we have audio
    if (shortsAudioBase64) {
      try {
        log(`[PROCESSOR] Rendering video short for ${filing.ticker}...`);
        sqlite.prepare("UPDATE filings SET status = ?, currentStep = 1, totalSteps = 1 WHERE id = ?").run('video_rendering', filing.id);
        
        // Read the actual audio data from file for the media engine
        const actualShortsAudio = getStorageFile('shorts', shortsAudioBase64);
        
        const videoPath = await MediaEngine.generateShort({
          ...filing,
          shortsScript: JSON.stringify(shortsData),
          shortsAudioBase64: actualShortsAudio
        });
        // Store relative path for the frontend
        const relativePath = `/media/${path.basename(path.dirname(videoPath))}/${path.basename(videoPath)}`;
        sqlite.prepare("UPDATE filings SET videoPath = ? WHERE id = ?").run(relativePath, filing.id);
      } catch (videoErr: any) {
        log(`[PROCESSOR] Video rendering failed: ${videoErr.message}`);
      }
    }
  } catch (audioErr: any) {
    log(`[PROCESSOR] Audio generation failed (likely API blocked), but continuing to save scripts: ${audioErr.message}`);
    // Store the error so the user knows why audio is missing
    sqlite.prepare("UPDATE filings SET error = ? WHERE id = ?").run(`Audio Error: ${audioErr.message}`, filing.id);
  }

  sqlite.prepare(`
    UPDATE filings SET 
      status = ?, 
      summary = ?, 
      podcastScript = ?, 
      shortsScript = ?, 
      audioBase64 = ?, 
      shortsAudioBase64 = ?
    WHERE id = ?
  `).run(
    'completed',
    analystData.summary,
    JSON.stringify(podcastScript),
    JSON.stringify(shortsData),
    audioBase64,
    shortsAudioBase64,
    filing.id
  );

  log(`[PROCESSOR] Successfully processed ${filing.ticker}.`);
  
  // Trigger Distributor Webhook
  try {
    log(`[WEBHOOK] Triggering Distributor ingest for ${filing.ticker}...`);
    const payload = {
      filingId: filing.id,
      ticker: filing.ticker,
      companyName: missionDoc.companyName || filing.ticker,
      formType: filing.formType,
      reportDate: filing.filingDate,
      isAudited: true, // Defaulting to true as per prompt requirement
      narrative: missionDoc.narrative,
      audioUrl: `${APP_URL}/media/audio/${audioBase64}`,
      shortAudioUrl: `${APP_URL}/media/shorts/${shortsAudioBase64}`,
      thumbnailUrl: `${APP_URL}/media/images/${filing.id}.png`,
      script: podcastScript,
      forcePublish: true
    };

    const response = await fetch(`${DISTRIBUTOR_URL}/api/v1/ingest`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Internal-Secret': INTERNAL_SECRET
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      log(`[WEBHOOK] Distributor ingest successful for ${filing.ticker}.`);
    } else {
      const errText = await response.text();
      log(`[WEBHOOK] Distributor ingest failed: ${response.status} ${errText}`);
    }
  } catch (webhookErr: any) {
    log(`[WEBHOOK] Error calling Distributor: ${webhookErr.message}`);
  }

  // Trigger a backup after successful processing
  backupDatabase();
}

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Reset stuck or failed filings to pending on startup to allow retries after fixes
  sqlite.prepare("UPDATE filings SET status = 'pending' WHERE status != 'completed'").run();
  
  // Also reset filings that completed but have no audio (likely failed during TTS quota limit)
  const missingAudio = sqlite.prepare("UPDATE filings SET status = 'pending' WHERE status = 'completed' AND audioBase64 IS NULL").run();
  if (missingAudio.changes > 0) {
    log(`[MAINTENANCE] Reset ${missingAudio.changes} filings for re-processing (missing audio).`);
  }

  const server = app.listen(3000, "0.0.0.0", () => {
    log(`[SERVER] Successfully listening on http://localhost:3000 (Process: ${PROCESS_ID})`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      log(`[SERVER] FATAL ERROR: Port 3000 is already in use. Process ${PROCESS_ID} cannot start.`);
    } else {
      log(`[SERVER] FATAL ERROR: ${err.message}`);
    }
  });
  
  startBackgroundWorker();
}

// Graceful shutdown
function shutdown() {
  console.log('[SERVER] Shutting down gracefully...');
  try {
    sqlite.close();
    console.log('[SQLITE] Database connection closed.');
  } catch (err) {
    console.error('[SQLITE] Error closing database:', err);
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startServer();
