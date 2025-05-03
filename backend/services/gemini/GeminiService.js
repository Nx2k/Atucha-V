import { GoogleGenAI } from '@google/genai';
import { readFileSync } from 'fs';

class GeminiService {
  constructor(apiKey) {
    if (!apiKey) throw new Error('Se requiere una API key de Gemini');
    this.ai = new GoogleGenAI({ apiKey });
    this.model = 'gemini-2.5-flash-preview-04-17';
  }

  async processMessage({ message, image, audio, video, sticker, document }) {
    const status = { results: {}, message: message || null };
    const mediaTypes = { image, audio, video, sticker, document };
    const promises = Object.entries(mediaTypes)
      .filter(([_, path]) => path)
      .map(([type, path]) => this[`process${type.charAt(0).toUpperCase() + type.slice(1)}`](path)
        .then(result => status.results[type] = result));

    await Promise.all(promises);
    return this.generateFinalResponse(status);
  }

  async processImage(imagePath) {
    const contents = [
      { inlineData: { mimeType: 'image/jpeg', data: readFileSync(imagePath, 'base64') } },
      { text: 'Examine the image thoroughly. Describe every detail, including all objects, colors, textures, actions, and backgrounds. Note the position, size, and shape of each element. Capture any text, lighting, or patterns. Provide a precise, comprehensive description to fully represent the image without assumptions or interpretations.' }
    ];

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents,
        config: { maxOutputTokens: 2048, temperature: 0.85 }
      });
      return { content: response.text };
    } catch {
      return { processed: false, error: 'Error al procesar imagen' };
    }
  }

  async processAudio(audioPath) {
    const contents = [
      { text: 'Listen to the audio carefully. Transcribe every word exactly as spoken, including tone, pauses, and any background sounds. Describe the speaker’s accent, speed, and emotional tone. Note any unclear parts and timestamp them. Provide a precise, detailed summary of the content without adding interpretations.' },
      { inlineData: { mimeType: 'audio/mp3', data: readFileSync(audioPath, 'base64') } }
    ];

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents,
        config: { maxOutputTokens: 2048, temperature: 0.85 }
      });
      return { content: response.text };
    } catch {
      return { processed: false, error: 'Error al procesar audio' };
    }
  }

  async processVideo(videoPath) {
    const contents = [
      { inlineData: { mimeType: 'video/mp4', data: readFileSync(videoPath, 'base64') } },
      { text: 'Watch the video closely. Describe every detail, including all actions, objects, colors, textures, and backgrounds. Note the sequence, timing, and duration of events. Capture any text, lighting, camera angles, or sound elements. If evident, identify and describe the emotional or sentimental tone (e.g., joy, sadness, enthusiasm) based on clear cues like facial expressions, voice tone, or music, without assumptions. For neutral content, such as stock or demonstration videos, note the absence of emotional tone. Provide a precise, comprehensive description to fully represent the video.' }
    ];

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents,
        config: { maxOutputTokens: 2048, temperature: 0.85 }
      });
      return { content: response.text };
    } catch {
      return { processed: false, error: 'Error al procesar video' };
    }
  }

  async processSticker(stickerPath) {
    const contents = [
      { inlineData: { mimeType: 'image/jpeg', data: readFileSync(stickerPath, 'base64') } },
      { text: 'Examine the sticker closely. Identify and describe the specific emotions, feelings, or allusions it conveys, such as affection, gratitude, joy, or affirmation. Focus solely on the intended emotional purpose, inferred from clear visual cues like expressions, symbols (e.g., hearts), or actions. Avoid describing the image’s content or making assumptions beyond evident emotional intent. Provide a precise, concise analysis of the sticker’s emotional message.' }
    ];

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents,
        config: { maxOutputTokens: 2048, temperature: 1 }
      });
      return { content: response.text };
    } catch {
      return { processed: false, error: 'Error al procesar sticker' };
    }
  }

  async processDocument(documentPath) {
    const contents = [
      { text: 'Examine the document meticulously. Extract and list all key factual information, technical specifications, data points, and specific details with precision. Summarize the content accurately, focusing solely on objective information. Exclude any interpretation, sentiment analysis, or assumptions. Ensure the summary is concise, technical, and faithful to the document’s content.' },
      { inlineData: { mimeType: 'application/pdf', data: readFileSync(documentPath).toString('base64') } }
    ];

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents,
        config: { maxOutputTokens: 2048, temperature: 0.45 }
      });
      return { content: response.text };
    } catch {
      return { processed: false, error: 'Error al procesar documento' };
    }
  }

  async generateFinalResponse({ results, message }) {
    const contextPrompt = [
      'This is the user’s text message and the provided transcription of the audio, video, image, sticker, or document in text format. Respond directly and concisely, continuing the conversation by addressing the user’s query or topic based on the transcription. Stay relevant, avoid misinterpretations, and do not add unrelated information.',
      message ? `\n\nUser's message: "${message}"` : '',
      ...Object.entries(results).map(([type, { content }]) => content ? `\n\n${type.charAt(0).toUpperCase() + type.slice(1)} ${type === 'audio' ? 'transcription' : type === 'document' ? 'summary' : 'description'}: ${content}` : '')
    ].filter(Boolean).join('');

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: [{ text: contextPrompt }],
        config: {
          maxOutputTokens: 2048,
          temperature: 0.9,
          systemInstruction: 'You are a conversational assistant. Receive the user’s message in text/plain format and any provided transcriptions or descriptions of audio, video, image, sticker, or document in text format. Understand the context and intent of the user’s message. Respond concisely and directly, continuing the conversation by addressing the user’s query or topic based on the provided content. Stay relevant, accurate, and focused on the objective information or emotional intent conveyed in the transcriptions. Avoid misinterpretations, assumptions, or unrelated information.'
        }
      });
      return { status: 'success', response: response.text, results: { text: { content: response.text } } };
    } catch {
      return { status: 'error', message: 'Error al generar respuesta final', processed: true, error: 'Error al generar respuesta final' };
    }
  }
}

export { GeminiService };