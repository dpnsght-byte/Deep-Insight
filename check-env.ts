
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";

dotenv.config();

async function check() {
  console.log("Checking environment...");
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (!fs.existsSync(configPath)) {
      console.error("firebase-applet-config.json missing!");
      return;
    }
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    console.log("Firebase Project ID:", config.projectId);

    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || config.apiKey;
    if (!key) {
      console.error("No API key found!");
      return;
    }
    console.log("API Key found (masked):", key.substring(0, 6) + "...");

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Hello");
    console.log("Gemini API test success:", result.response.text());
  } catch (err: any) {
    console.error("Check failed:", err.message);
  }
}

check();
