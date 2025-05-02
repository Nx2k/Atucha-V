import { GoogleGenAI } from "@google/genai";
import fs from 'fs';

class GeminiService {
  constructor(apiKey) {
    if (!apiKey) { throw new Error("Se requiere una API key de Gemini") }
    this.apiKey = apiKey;
    this.ai = new GoogleGenAI({ apiKey });
    this.model = "gemini-2.5-flash-preview-04-17"
  }

  async processMessage(messageData) {
    const { message, image, audio, video, sticker, document } = messageData;
    const processingStatus = {
      imageProcessed: false,
      audioProcessed: false,
      videoProcessed: false,
      stickerProcessed: false,
      documentProcessed: false,
      message: message || null,
      results: {}
    };
    const processingPromises = [];

    if (image) {
      processingPromises.push(
        this.processImage(image)
          .then(result => {
            processingStatus.imageProcessed = true;
            processingStatus.results.image = result;
          })
      );
    } else {
      processingStatus.imageProcessed = true;
    }

    if (audio) {
      processingPromises.push(
        this.processAudio(audio)
          .then(result => {
            processingStatus.audioProcessed = true;
            processingStatus.results.audio = result;
          })
      );
    } else {
      processingStatus.audioProcessed = true;
    }

    if (video) {
      processingPromises.push(
        this.processVideo(video)
          .then(result => {
            processingStatus.videoProcessed = true;
            processingStatus.results.video = result;
          })
      );
    } else {
      processingStatus.videoProcessed = true;
    }

    if (sticker) {
      processingPromises.push(
        this.processSticker(sticker)
          .then(result => {
            processingStatus.stickerProcessed = true;
            processingStatus.results.sticker = result;
          })
      );
    } else {
      processingStatus.stickerProcessed = true;
    }

    if (document) {
      processingPromises.push(
        this.processDocument(document)
          .then(result => {
            processingStatus.documentProcessed = true;
            processingStatus.results.document = result;
          })
      );
    } else {
      processingStatus.documentProcessed = true;
    }

    await Promise.all(processingPromises);
    return this.generateFinalResponse(processingStatus);
  }

  async processImage(imagePath) {
    try {
      const base64ImageFile = fs.readFileSync(imagePath, {encoding: "base64"});
      const contents = [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64ImageFile,
          },
        },
        { text: "Examine the image thoroughly. Describe every detail, including all objects, colors, textures, actions, and backgrounds. Note the position, size, and shape of each element. Capture any text, lighting, or patterns. Provide a precise, comprehensive description to fully represent the image without assumptions or interpretations." },
      ];

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: contents,
        config: {
          maxOutputTokens: 2048,
          temperature: 0.85
        }});

      return { content: response.text };

    } catch (error) {
      console.error("Error al procesar imagen:", error);
      return {
        processed: false,
        error: error.message
      };
    }
  }

  async processAudio(audioPath) {
    try {
      const base64AudioFile = fs.readFileSync(audioPath, {encoding: "base64"});
      const contents = [
        { text: "Listen to the audio carefully. Transcribe every word exactly as spoken, including tone, pauses, and any background sounds. Describe the speaker's accent, speed, and emotional tone. Note any unclear parts and timestamp them. Provide a precise, detailed summary of the content without adding interpretations." },
        {
          inlineData: {
            mimeType: "audio/mp3",
            data: base64AudioFile,
          },
        },
      ];

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: contents,
        config: {
          maxOutputTokens: 2048,
          temperature: 0.85
        }
      });

      return { content: response.text };
    } catch (error) {
      console.error("Error al procesar audio:", error);
      return {
        processed: false,
        error: error.message
      };
    }
  }

  async processVideo(videoPath) {
    try {
      const base64VideoFile = fs.readFileSync(videoPath, {encoding: "base64"});
      const contents = [
        {
          inlineData: {
            mimeType: "video/mp4",
            data: base64VideoFile,
          },
        },
        { text: "Watch the video closely. Describe every detail, including all actions, objects, colors, textures, and backgrounds. Note the sequence, timing, and duration of events. Capture any text, lighting, camera angles, or sound elements. If evident, identify and describe the emotional or sentimental tone (e.g., joy, sadness, enthusiasm) based on clear cues like facial expressions, voice tone, or music, without assumptions. For neutral content, such as stock or demonstration videos, note the absence of emotional tone. Provide a precise, comprehensive description to fully represent the video." }
      ];

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: contents,
        config: {
          maxOutputTokens: 2048,
          temperature: 0.85
        }
      });

      return { content: response.text };

    } catch (error) {
      console.error("Error al procesar video:", error);
      return {
        processed: false,
        error: error.message
      };
    }
  }

  async processSticker(stickerPath) {
    try {
      const base64ImageFile = fs.readFileSync(stickerPath, {encoding: "base64"});
      const contents = [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64ImageFile,
          },
        },
        { text: "Examine the sticker closely. Identify and describe the specific emotions, feelings, or allusions it conveys, such as affection, gratitude, joy, or affirmation. Focus solely on the intended emotional purpose, inferred from clear visual cues like expressions, symbols (e.g., hearts), or actions. Avoid describing the image's content or making assumptions beyond evident emotional intent. Provide a precise, concise analysis of the sticker's emotional message." },
      ];

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: contents,
        config: {
          maxOutputTokens: 2048,
          temperature: 1
        }});

      return { content: response.text };

    } catch (error) {
      console.error("Error al procesar imagen:", error);
      return {
        processed: false,
        error: error.message
      };
    }
  }

  async processDocument(documentPath) {
    try {

      const contents = [
        { text: "Examine the document meticulously. Extract and list all key factual information, technical specifications, data points, and specific details with precision. Summarize the content accurately, focusing solely on objective information. Exclude any interpretation, sentiment analysis, or assumptions. Ensure the summary is concise, technical, and faithful to the document's content." },
        { inlineData: {mimeType: 'application/pdf', data: Buffer.from(fs.readFileSync(documentPath)).toString("base64")}}];

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: contents,
        config: {
          maxOutputTokens: 2048,
          temperature: 0.45
        }});
      
      return { content: response.text };
    } catch (error) {
      console.error("Error al procesar documento:", error);
      return {
        processed: false,
        error: error.message
      };
    }
  }

  async generateFinalResponse(processingStatus) {
    const allProcessed = Object.keys(processingStatus)
      .filter(key => key.endsWith('Processed'))
      .every(key => processingStatus[key] === true);

    if (allProcessed) {
      const results = processingStatus.results;
      const message = processingStatus.message || null;
      
      let contextPrompt = "This is the user's text message and the provided transcription of the audio, video, image, sticker, or document in text format. Respond directly and concisely, continuing the conversation by addressing the user's query or topic based on the transcription. Stay relevant, avoid misinterpretations, and do not add unrelated information.";
      
      if (message) {
        contextPrompt += `\n\nUser's message: "${message}"`;
      }
      
      if (results.image && results.image.content) {
        contextPrompt += `\n\nImage content: ${results.image.content}`;
      }
      
      if (results.audio && results.audio.content) {
        contextPrompt += `\n\nAudio transcription: ${results.audio.content}`;
      }
      
      if (results.video && results.video.content) {
        contextPrompt += `\n\nVideo description: ${results.video.content}`;
      }
      
      if (results.sticker && results.sticker.content) {
        contextPrompt += `\n\nSticker description: ${results.sticker.content}`;
      }
      
      if (results.document && results.document.content) {
        contextPrompt += `\n\nDocument summary: ${results.document.content}`;
      }
      
      const contents = [{ text: contextPrompt }];
      
      try {
        const response = await this.ai.models.generateContent({
          model: this.model,
          contents: contents,
          config: {
            maxOutputTokens: 2048,
            temperature: 0.7,
            systemInstruction: "You are a conversational assistant. Receive the user's message in text/plain format and any provided transcriptions or descriptions of audio, video, image, sticker, or document in text format. Understand the context and intent of the user's message. Respond concisely and directly, continuing the conversation by addressing the user's query or topic based on the provided content. Stay relevant, accurate, and focused on the objective information or emotional intent conveyed in the transcriptions. Avoid misinterpretations, assumptions, or unrelated information."
          }
        });
        
        return { response: response.text };
      } catch (error) {
        console.error("Error al generar respuesta final:", error);
        return {
          status: "error",
          message: "Error al generar respuesta final",
          processed: true,
          error: error.message,
          chatId: chatId
        };
      }
    } else {
      return {
        status: "processing",
        processed: false
      };
    }
  }
}

export { GeminiService };