import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { createCanvas, loadImage } from "canvas";
import fs from "fs";
import path from "path";

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export class MediaEngine {
  private static TEMP_DIR = path.join(process.cwd(), "temp_media");
  private static LOG_FILE = path.join(process.cwd(), "server_sqlite.log");

  private static log(msg: string) {
    const timestamp = new Date().toISOString();
    const formattedMsg = `[${timestamp}] [MEDIA] ${msg}`;
    console.log(formattedMsg);
    try {
      fs.appendFileSync(this.LOG_FILE, formattedMsg + "\n");
    } catch (err) {}
  }

  static async init() {
    if (!fs.existsSync(this.TEMP_DIR)) {
      fs.mkdirSync(this.TEMP_DIR, { recursive: true });
    }
  }

  /**
   * Generates a 30-second vertical video short (9:16)
   */
  static async generateShort(filing: any): Promise<string> {
    const videoId = filing.id;
    const outputDir = path.join(this.TEMP_DIR, videoId);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const videoPath = path.join(outputDir, "short.mp4");
    const audioPath = path.join(outputDir, "audio.wav");
    const frameDir = path.join(outputDir, "frames");
    if (!fs.existsSync(frameDir)) fs.mkdirSync(frameDir, { recursive: true });

    // 1. Save audio to disk
    if (filing.shortsAudioBase64) {
      const audioBuffer = Buffer.from(filing.shortsAudioBase64, "base64");
      fs.writeFileSync(audioPath, audioBuffer);
    } else {
      this.log(`Warning: No audio data for ${filing.ticker} Short. Video will be silent.`);
      // Create a 1-second silent wav as fallback if needed, or just let ffmpeg handle it
      // For now, we'll just skip audio input if it doesn't exist
    }

    // 2. Generate Frames (9:16 - 1080x1920)
    const width = 1080;
    const height = 1920;
    const fps = 30;
    const duration = 30; // 30 seconds
    const totalFrames = fps * duration;

    this.log(`Generating ${totalFrames} frames for ${filing.ticker} Short...`);

    let scriptText = "";
    let visuals: string[] = [];
    try {
      const parsed = JSON.parse(filing.shortsScript);
      scriptText = parsed.script || "";
      visuals = parsed.visuals || [];
    } catch (e) {
      scriptText = filing.shortsScript || "";
    }

    const words = scriptText.split(" ");
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");

    // roundRect polyfill
    const drawRoundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
    };

    for (let i = 0; i < totalFrames; i++) {
      // Yield every 10 frames to keep the event loop responsive
      if (i % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }

      // Clear canvas for next frame
      ctx.clearRect(0, 0, width, height);

      // Background: Dark Slate
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, width, height);

      // Gradient Overlay
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, "rgba(56, 189, 248, 0.05)");
      grad.addColorStop(1, "rgba(2, 6, 23, 1)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Header: Bento Style
      ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
      drawRoundRect(100, 100, width - 200, 250, 40);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.2)";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 40px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("DEEP INSIGHT", width / 2, 180);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 80px sans-serif";
      ctx.fillText(filing.ticker, width / 2, 280);

      // Progress Bar
      const progress = i / totalFrames;
      ctx.fillStyle = "rgba(56, 189, 248, 0.1)";
      ctx.fillRect(0, height - 10, width, 10);
      ctx.fillStyle = "#38bdf8";
      ctx.fillRect(0, height - 10, width * progress, 10);

      // Animated Chart Area
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(100, 1000);
      for (let x = 0; x < 880; x++) {
        const y = 1000 - Math.sin((x / 120) + (progress * 15)) * 120 - (x * 0.1);
        ctx.lineTo(100 + x, y);
      }
      ctx.stroke();

      // Visual Overlays
      if (visuals.length > 0) {
        const visualIndex = Math.floor(progress * visuals.length);
        const currentVisual = visuals[visualIndex];
        if (currentVisual) {
          ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
          drawRoundRect(100, 500, width - 200, 200, 30);
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 4;
          ctx.stroke();

          ctx.fillStyle = "#fbbf24";
          ctx.font = "bold 60px sans-serif";
          ctx.fillText(currentVisual, width / 2, 620);
        }
      }

      // Captions
      const currentWordIndex = Math.floor(progress * words.length);
      const startWord = Math.max(0, currentWordIndex - 3);
      const endWord = Math.min(words.length, currentWordIndex + 4);
      
      ctx.font = "bold 70px sans-serif";
      ctx.textAlign = "center";
      
      const segment = words.slice(startWord, endWord);
      const segmentText = segment.join(" ");
      const activeWord = words[currentWordIndex] || "";
      
      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.fillText(segmentText, width / 2, 1400);
      
      ctx.fillStyle = "#fbbf24";
      ctx.fillText(activeWord, width / 2, 1500);

      // Save frame
      const framePath = path.join(frameDir, `frame_${i.toString().padStart(5, "0")}.png`);
      const buffer = canvas.toBuffer("image/png");
      fs.writeFileSync(framePath, buffer);

      if (i % 100 === 0) this.log(`Frame ${i}/${totalFrames} done`);
    }

    // 3. Assemble Video
    return new Promise((resolve, reject) => {
      const framePattern = path.join(frameDir, "frame_%05d.png");
      this.log(`Starting FFmpeg with frames: ${framePattern}`);
      
      const command = ffmpeg().input(framePattern).inputFPS(fps);
      
      if (fs.existsSync(audioPath)) {
        command.input(audioPath);
      }

      command
        .outputOptions([
          "-c:v libx264",
          "-pix_fmt yuv420p",
          "-shortest",
          "-vf scale=1080:1920"
        ])
        .on("start", (cmd) => this.log(`FFmpeg started: ${cmd}`))
        .on("end", () => {
          this.log(`Video generation complete: ${videoPath}`);
          resolve(videoPath);
        })
        .on("error", (err, stdout, stderr) => {
          this.log(`FFmpeg Error: ${err.message}`);
          this.log(`FFmpeg Stderr: ${stderr}`);
          reject(err);
        })
        .save(videoPath);
    });
  }
}
