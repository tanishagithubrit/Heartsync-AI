/* server.js - HEART Sync AI backend (ES Module version) */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
app.use(express.json());
app.use(cors());

// Config
const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Mongoose models ---
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error', err));

const messageSchema = new mongoose.Schema({
  userId: String,
  role: { type: String, enum: ['user', 'assistant', 'system'], default: 'user' },
  text: String,
  emotion: String,
  confidence: Number,
  meta: Object,
  createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// --- Helpers ---
async function moderateText(text) {
  try {
    const mod = await openai.moderations.create({
      model: 'omni-moderation-latest',
      input: text
    });
    return mod;
  } catch (err) {
    console.error('Moderation error', err);
    return null;
  }
}

function localRedFlagCheck(text) {
  const low = text.toLowerCase();
  const suicideRegex = /\b(suicid|kill myself|end my life|want to die|want to kill myself|want to destroy my life)\b/;
  if (suicideRegex.test(low)) return { type: 'suicide', matched: true };
  return { type: null, matched: false };
}

async function classifyEmotionWithLLM(text) {
  const prompt = `
You are an emotion classifier. Classify the user's text into one of these labels:
["joy","sadness","anger","fear","neutral","surprise","disgust","confused","shame","guilt"].

Return ONLY a single-line valid JSON object with keys:
{"emotion": "...", "confidence": 0.00}

Text: ${JSON.stringify(text)}
JSON:
  `;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful emotion classification assistant.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 120,
      temperature: 0.0
    });

    const raw = resp.choices?.[0]?.message?.content || resp.choices?.[0]?.delta?.content;
    try {
      const jsonStart = raw.indexOf('{');
      const jsonText = raw.slice(jsonStart);
      const parsed = JSON.parse(jsonText);
      return { emotion: parsed.emotion, confidence: parsed.confidence || 0.5, raw };
    } catch (e) {
      console.warn('Failed to parse emotion JSON from model, raw:', raw);
      return { emotion: 'neutral', confidence: 0.5, raw };
    }
  } catch (err) {
    console.error('Emotion classification error', err);
    return { emotion: 'neutral', confidence: 0.5, raw: null };
  }
}

async function generateEmpatheticReply(userText, classification) {
  const systemPrompt = `
You are "HEART Sync" — an empathetic, supportive conversational AI. 
Rules:
- Be warm, reflective, validating and concise (2-5 short paragraphs).
- Do NOT give medical advice or attempt to diagnose.
- If input indicates immediate safety risk, respond with urgent referral.
`;

  const prompt = `
User message: ${JSON.stringify(userText)}

Classification: ${JSON.stringify(classification)}

Now generate a compassionate reply as plain text.
`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      max_tokens: 300,
      temperature: 0.8
    });

    const reply = resp.choices?.[0]?.message?.content || '';
    return reply;
  } catch (err) {
    console.error('generateEmpatheticReply error', err);
    return "I'm sorry — I'm having trouble right now. Please try again in a moment.";
  }
}

// --- Endpoint ---
app.post('/api/message', async (req, res) => {
  const { userId, text } = req.body;
  if (!text || !userId) return res.status(400).json({ error: 'userId and text required' });

  const userMsg = await Message.create({ userId, role: 'user', text });

  const mod = await moderateText(text);
  const flagged = mod?.results?.[0]?.flagged || false;

  const redFlag = localRedFlagCheck(text);
  if (redFlag.matched) {
    const crisisReply = `I'm really sorry you're feeling this way. If you are in immediate danger or might hurt yourself, please contact your local emergency services or a suicide/crisis hotline.`;
    const assistantMsg = await Message.create({
      userId, role: 'assistant', text: crisisReply,
      emotion: 'suicide', confidence: 1.0, meta: { redFlag: true }
    });
    return res.json({ assistant: assistantMsg, flagged: true, moderation: mod });
  }

  if (flagged) {
    const safeReply = `I can't assist with that. If this involves something dangerous or illegal, please contact local authorities or a trusted person for immediate help.`;
    const assistantMsg = await Message.create({
      userId, role: 'assistant', text: safeReply, emotion: 'neutral', confidence: 0.5, meta: { moderation: mod }
    });
    return res.json({ assistant: assistantMsg, flagged: true, moderation: mod });
  }

  const classification = await classifyEmotionWithLLM(text);
  const assistantText = await generateEmpatheticReply(text, classification);

  const assistantMsg = await Message.create({
    userId, role: 'assistant', text: assistantText, emotion: classification.emotion, confidence: classification.confidence, meta: { classificationRaw: classification.raw }
  });

  res.json({ assistant: assistantMsg, classification, moderation: mod });
});

app.listen(PORT, () => console.log(`HEART Sync API listening on http://localhost:${PORT}`));
