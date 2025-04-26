Propuesta para un Chatbot Multimodal de Atención al Cliente con Gemini API
Este documento detalla una arquitectura y estrategia para desarrollar un chatbot multimodal basado en la API de Gemini, diseñado para un sistema de atención al cliente que opera en plataformas de mensajería como WhatsApp (usando Baileys) y Telegram. El chatbot debe manejar entradas de texto, imágenes, PDFs, audio y video, generar respuestas naturales, procesar datos estructurados en JSON, ejecutar acciones mediante function calling, y mantener el contexto conversacional durante una ventana de 4 horas, todo mientras opera de manera transparente para los usuarios, quienes perciben la interacción como si hablaran con una persona.

Objetivo
Crear un chatbot que:

Procesa entradas multimodales: Texto (consultas, solicitudes), imágenes (e.g., facturas), PDFs, audio (mensajes de voz), y videos.
Interpreta intenciones automáticamente: Identifica si el usuario envía una factura, pide un turno, o hace una consulta general sin comandos explícitos.
Genera datos estructurados: Extrae información (e.g., datos de facturas) y la convierte en JSON con esquemas predefinidos.
Ejecuta acciones: Usa function calling para realizar tareas como registrar pagos o agendar turnos.
Mantiene contexto conversacional: Recuerda la conversación y acciones previas dentro de una ventana de 4 horas para respuestas coherentes.
Optimiza recursos: Cierra sesiones inactivas tras 4 horas y no guarda contexto entre días, ya que cada interacción resuelve un caso específico.
Integra con mensajería: Funciona con un manejador de eventos que produce JSON con sessionId, chatId, y campos para texto, imagen, audio, video, sticker, o documento.
Contexto del Sistema de Mensajería
El chatbot se integra con un sistema de mensajería existente que usa Baileys (WhatsApp) y Telegram. Cada mensaje nuevo genera un evento con un JSON como este:

{
  "sessionId": "01",
  "chatId": "5491138009199@s.whatsapp.net",
  "message": null,
  "image": null,
  "audio": null,
  "video": null,
  "sticker": null,
  "document": null
}

sessionId: Identifica la sesión.
chatId: Identifica el chat (con @ para WhatsApp, sin @ para Telegram).
Campos de contenido: message (texto), image, audio, video, sticker, document (uno o más pueden contener datos, los demás son null).
El manejador de eventos pasa este JSON al chatbot, que procesa la entrada y genera una respuesta para enviar de vuelta al usuario.

Arquitectura Propuesta: Sistema Jerárquico con Supervisor
La arquitectura utiliza un sistema jerárquico con un supervisor que coordina agentes especializados para procesar entradas, estructurar datos, ejecutar acciones, y generar respuestas. Este enfoque es modular, robusto y escalable, ideal para un chatbot de atención al cliente.

Componentes Principales
Supervisor (Orquestador):
Recibe el JSON del manejador de eventos.
Clasifica la intención del usuario (e.g., consulta, factura, turno).
Decide qué agente debe procesar la entrada.
Coordina la generación de respuestas y la ejecución de acciones.
Gestiona el contexto conversacional (historial y acciones).
Agentes Especializados:
Agente de Texto: Maneja consultas generales y mantiene el diálogo.
Agente de Procesamiento Multimodal: Extrae información de imágenes, PDFs, audio y videos.
Agente de Estructuración de Datos: Convierte datos extraídos en JSON con esquemas predefinidos.
Agente de Function Calling: Ejecuta funciones basadas en datos estructurados (e.g., registrar pagos, agendar turnos).
Agente de Respuesta: Genera respuestas naturales, informadas por el contexto y acciones previas.
Herramientas de Gemini API:
Generación de texto: Respuestas conversacionales.
Procesamiento multimodal: Análisis de imágenes, PDFs, audio, video.
Esquemas JSON: Estructuración de datos extraídos.
Function calling: Ejecución de acciones como register_payment o schedule_meeting.
System instructions: Define el tono y comportamiento (e.g., "Actúa como un asistente profesional").
Base de Conocimiento:
Almacena esquemas JSON, declaraciones de funciones, y reglas de negocio (e.g., formatos de facturas, horarios de turnos).
Ejemplo:

const schemas = {
  invoice: { type: "object", properties: { invoiceNumber: { type: "string" }, ... } },
  meeting: { type: "object", properties: { date: { type: "string" }, ... } }
};

Almacenamiento de Contexto:
Un almacén temporal (e.g., objeto en memoria o Redis) guarda el historial y acciones por sessionId:chatId:

{
  "01:5491138009199@s.whatsapp.net": {
    history: [{ role: "user", parts: [{ text: "..." }] }, ...],
    actions: [{ actionType: "register_payment", data: {...}, ... }],
    lastActivity: 1623456789000
  }
}

Un temporizador elimina sesiones inactivas tras 4 horas.
Flujo de Procesamiento Paso a Paso
Paso 1: Recepción del Mensaje
El manejador de eventos envía un JSON con sessionId, chatId, y contenido (message, image, etc.).
Ejemplo:

{
  "sessionId": "01",
  "chatId": "5491138009199@s.whatsapp.net",
  "message": "Aquí está mi factura",
  "image": "base64_datos_imagen",
  "audio": null,
  "video": null,
  "sticker": null,
  "document": null
}

Paso 2: Clasificación de Intención (Supervisor)
El supervisor usa Gemini para clasificar la intención:

Analiza el mensaje y archivo (si existe). Clasifica la intención en:
- Consulta general
- Solicitud de turno
- Envío de factura/comprobante
- Cancelación de turno
- Otro
Devuelve la intención y el tipo de archivo (imagen, PDF, audio, video, documento).

Ejemplo: Para el mensaje "Aquí está mi factura" + imagen, clasifica como "Envío de factura" y tipo "imagen".
Paso 3: Procesamiento Multimodal (Agente Multimodal)
Si hay un archivo, el agente multimodal lo procesa:
Imágenes/PDFs: Extrae datos (e.g., número de factura, monto, fecha, emisor) usando un prompt:

Extrae los siguientes datos de esta imagen/PDF: número de factura, monto, fecha, emisor.
Devuelve un JSON: { "invoiceNumber": string, "amount": number, "date": string, "issuer": string }

Audio: Genera una transcripción.
Video: Resume el contenido o extrae información relevante.
Ejemplo: Para una imagen de factura, devuelve:
json

Copiar
{
  "invoiceNumber": "12345",
  "amount": 500,
  "date": "2025-04-24",
  "issuer": "Empresa X"
}
Paso 4: Estructuración de Datos (Agente de Estructuración)
Valida y convierte los datos extraídos en un JSON con un esquema predefinido:
javascript

Copiar
{
  type: "object",
  properties: {
    invoiceNumber: { type: "string" },
    amount: { type: "number" },
    date: { type: "string", format: "date" },
    issuer: { type: "string" }
  },
  required: ["invoiceNumber", "amount", "date"]
}
Si el JSON es inválido, reintenta hasta 3 veces o notifica al supervisor.
Paso 5: Function Calling (Agente de Function Calling)
Basado en la intención y el JSON estructurado, ejecuta una función:
Ejemplo: Para una factura, llama a register_payment:
javascript

Copiar
const registerPayment = {
  name: "register_payment",
  description: "Registra un pago basado en los datos de una factura.",
  parameters: {
    type: "object",
    properties: {
      invoiceNumber: { type: "string" },
      amount: { type: "number" },
      date: { type: "string" },
      issuer: { type: "string" }
    },
    required: ["invoiceNumber", "amount", "date"]
  }
};
Para un turno: Llama a schedule_meeting.
Registra la acción en el contexto:
javascript

Copiar
{
  actionType: "register_payment",
  data: { invoiceNumber: "12345", amount: 500, date: "2025-04-24", issuer: "Empresa X" },
  timestamp: Date.now(),
  result: "success"
}
Paso 6: Generación de Respuesta (Agente de Respuesta)
Genera una respuesta natural, usando el contexto de acciones previas:
Consulta las acciones almacenadas:
javascript

Copiar
const actions = contextStore["01:5491138009199@s.whatsapp.net"].actions;
const actionsContext = actions.map(a => `Acción: ${a.actionType}, Datos: ${JSON.stringify(a.data)}, Resultado: ${a.result}`).join("\n");
Prompt para Gemini:
plaintext

Copiar
Eres un asistente de atención al cliente. Responde de manera clara, amigable y profesional.
Contexto de acciones previas:
{actionsContext}
Responde al mensaje: {userInput}
Ejemplo: "Gracias por enviar la factura. He registrado el pago de $500 (factura 12345). ¿En qué más puedo ayudarte?"
Paso 7: Actualización del Contexto
Actualiza el historial conversacional:
javascript

Copiar
contextStore["01:5491138009199@s.whatsapp.net"].history.push(
  { role: "user", parts: [{ text: "Aquí está mi factura" }] },
  { role: "model", parts: [{ text: "Gracias, he registrado el pago..." }] }
);
Actualiza lastActivity con el timestamp actual.
Paso 8: Manejo de Sesiones
Un temporizador elimina sesiones inactivas tras 4 horas:
javascript

Copiar
setInterval(() => {
  for (const key in contextStore) {
    if (Date.now() - contextStore[key].lastActivity > 4 * 60 * 60 * 1000) {
      delete contextStore[key];
    }
  }
}, 60000);
Ejemplo de Interacción Completa
Usuario (10:00): "Aquí está mi factura" + [imagen].
Supervisor: Clasifica como "Envío de factura", pasa la imagen al Agente Multimodal.
Agente Multimodal: Extrae: { "invoiceNumber": "12345", "amount": 500, "date": "2025-04-24", "issuer": "Empresa X" }.
Agente de Estructuración: Valida el JSON.
Agente de Function Calling: Llama a register_payment, registra la acción.
Agente de Respuesta: "Gracias, he registrado el pago de $500 (factura 12345)."
Contexto: Se actualiza con el historial y la acción.
Usuario (12:00): "Quiero cancelar mi turno."
Supervisor: Clasifica como "Cancelación de turno".
Agente de Respuesta: Consulta acciones previas, ve el pago registrado, y genera:
plaintext

Copiar
Contexto: Acción: register_payment, Datos: {"invoiceNumber":"12345","amount":500,"date":"2025-04-24"}, Resultado: success
Responde: Quiero cancelar mi turno.
Respuesta: "Entendido, voy a cancelar tu turno. Como registramos un pago de $500 (factura 12345), ¿quieres que procesemos la devolución?"
Robustez y Manejo de Errores
Reintentos:
Si Gemini devuelve una respuesta vacía o JSON inválido, reintenta hasta 3 veces.
Si falla tras los intentos, responde: "Lo siento, no pude procesar tu solicitud. Intenta de nuevo."
Validación de Entradas:
Verifica formatos de archivos (e.g., JPEG, PDF, MP3) y tamaños.
Valida JSON contra esquemas predefinidos.
Intenciones Ambiguas:
Si la intención no es clara, responde: "No estoy seguro de lo que necesitas. ¿Puedes darme más detalles?"
Errores en Funciones:
Si una función falla (e.g., API externa no disponible), registra el error y responde: "No pude procesar eso ahora. Intenta de nuevo más tarde."
Expiración de Contexto:
Sesiones inactivas se eliminan tras 4 horas, asegurando que interacciones de un nuevo día sean tratadas como nuevas.
Implementación Técnica
Requisitos
Librerías:
@google/genai: Para la API de Gemini.
node:fs: Para manejar archivos.
readline: Para pruebas en consola (opcional).
redis (opcional): Para almacenar contexto en producción.
Entorno: Node.js.
API Key: Clave válida para Gemini API.
Estructura del Código
javascript

Copiar
// Almacenamiento temporal
const contextStore = {};

// Limpieza de sesiones inactivas
setInterval(() => {
  for (const key in contextStore) {
    if (Date.now() - contextStore[key].lastActivity > 4 * 60 * 60 * 1000) {
      delete contextStore[key];
    }
  }
}, 60000);

// Declaraciones de funciones
const registerPayment = {
  name: "register_payment",
  description: "Registra un pago basado en los datos de una factura.",
  parameters: {
    type: "object",
    properties: {
      invoiceNumber: { type: "string" },
      amount: { type: "number" },
      date: { type: "string" },
      issuer: { type: "string" }
    },
    required: ["invoiceNumber", "amount", "date"]
  }
};

const scheduleMeeting = {
  name: "schedule_meeting",
  description: "Agenda un turno.",
  parameters: {
    type: "object",
    properties: {
      date: { type: "string" },
      time: { type: "string" },
      topic: { type: "string" }
    },
    required: ["date", "time"]
  }
};

// Funciones reales (simuladas)
function executeRegisterPayment(data) {
  return { status: "success", message: `Pago registrado: ${data.invoiceNumber}, $${data.amount}` };
}

function executeScheduleMeeting(data) {
  return { status: "success", message: `Turno agendado: ${data.date} ${data.time}` };
}

class ChatbotSupervisor {
  constructor(apiKey) {
    this.ai = new GoogleGenAI({ apiKey });
    this.functions = [registerPayment, scheduleMeeting];
  }

  async processInput({ sessionId, chatId, input, file, fileType }) {
    const contextKey = `${sessionId}:${chatId}`;
    if (!contextStore[contextKey]) {
      contextStore[contextKey] = { history: [], lastActivity: Date.now(), actions: [] };
    }
    contextStore[contextKey].lastActivity = Date.now();

    const chat = this.ai.chats.create({
      model: "gemini-2.0-flash",
      history: contextStore[contextKey].history,
      config: { maxOutputTokens: 500, temperature: 0.7, tools: [{ functionDeclarations: this.functions }] }
    });

    let responseText = "";
    let actionTaken = null;

    if (file) {
      // Procesar archivo
      const contents = [
        { inlineData: { mimeType: fileType === "image" ? "image/jpeg" : "application/pdf", data: file } },
        { text: `Extrae datos de este ${fileType}: número de factura, monto, fecha, emisor.` }
      ];
      let attempts = 0;
      while (attempts < 3) {
        try {
          const response = await chat.sendMessage({ message: contents });
          const jsonData = JSON.parse(response.text);
          actionTaken = {
            actionType: "register_payment",
            data: jsonData,
            timestamp: Date.now(),
            result: "success"
          };
          contextStore[contextKey].actions.push(actionTaken);
          const functionResult = executeRegisterPayment(jsonData);
          responseText = `Gracias, he registrado el pago de $${jsonData.amount} (factura ${jsonData.invoiceNumber}).`;
          break;
        } catch (error) {
          attempts++;
          if (attempts === 3) responseText = "No pude procesar el archivo. Intenta de nuevo.";
        }
      }
    } else {
      // Procesar texto
      const actionsContext = contextStore[contextKey].actions
        .map(a => `Acción: ${a.actionType}, Datos: ${JSON.stringify(a.data)}, Resultado: ${a.result}`)
        .join("\n");
      const prompt = `Eres un asistente de atención al cliente. Responde de manera clara, amigable y profesional.
Contexto de acciones previas:
${actionsContext}
Mensaje del usuario: ${input}`;
      let attempts = 0;
      while (attempts < 3) {
        try {
          const response = await chat.sendMessage({ message: prompt });
          if (response.functionCalls && response.functionCalls.length > 0) {
            const fn = response.functionCalls[0];
            actionTaken = {
              actionType: fn.name,
              data: fn.args,
              timestamp: Date.now(),
              result: "success"
            };
            contextStore[contextKey].actions.push(actionTaken);
            responseText = fn.name === "schedule_meeting"
              ? `Turno agendado para ${fn.args.date} a las ${fn.args.time}.`
              : `Acción realizada: ${fn.name}.`;
          } else {
            responseText = response.text;
          }
          break;
        } catch (error) {
          attempts++;
          if (attempts === 3) responseText = "No pude procesar tu mensaje. Intenta de nuevo.";
        }
      }
    }

    contextStore[contextKey].history.push(
      { role: "user", parts: [{ text: input || "[Archivo]" }] },
      { role: "model", parts: [{ text: responseText }] }
    );

    return responseText;
  }
}

// Integración con Baileys/Telegram
function handleNewMessage(event) {
  const { sessionId, chatId, message, image, audio, video, sticker, document } = event;
  const file = image || audio || video || sticker || document;
  const fileType = image ? "image" : audio ? "audio" : video ? "video" : document ? "document" : null;
  const chatbot = new ChatbotSupervisor("GEMINI_API_KEY");
  return chatbot.processInput({ sessionId, chatId, input: message, file, fileType });
}

Integración con el Manejador de Eventos
El manejador de eventos pasa el JSON al ChatbotSupervisor.
La respuesta se envía de vuelta al usuario vía WhatsApp/Telegram.
Escalabilidad
Usa Redis para contextStore en producción.
Implementa colas (e.g., Bull) para manejar muchos mensajes simultáneamente.
Ventajas
Transparencia: Los usuarios no perciben la complejidad técnica.
Contexto Coherente: El agente de respuesta usa acciones previas para respuestas naturales.
Eficiencia: Sesiones expiran tras 4 horas, optimizando recursos.
Modularidad: Fácil de extender con nuevos agentes o funciones.
Robustez: Reintentos y validaciones aseguran estabilidad.
Consideraciones
Pruebas: Simula mensajes con facturas, turnos, y cancelaciones.
Seguridad: Valida archivos y sanitiza entradas.
Monitoreo: Registra errores para depuración.
Pasos para Implementar
Configura el entorno Node.js e instala @google/genai.
Crea la base de conocimiento con esquemas JSON y funciones.
Implementa el ChatbotSupervisor y agentes.
Integra con el manejador de eventos de Baileys/Telegram.
Prueba con casos reales (facturas, turnos, consultas).
Escala con Redis y colas si es necesario.
Este diseño es claro y detallado para que otra IA pueda implementarlo. Si necesitas ajustar algo, avisa.


Documentacion relevante:

https://ai.google.dev/gemini-api/docs/structured-output?hl=es-419&lang=node
Genera resultados estructurados con la API de Gemini
https://ai.google.dev/gemini-api/docs/structured-output?hl=es-419&lang=node#generate-json
Proporciona un esquema como texto en la instrucción


import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "GEMINI_API_KEY" });

async function main() {
    const prompt = `List a few popular cookie recipes using this JSON schema:

    Recipe = {'recipeName': string}
    Return: Array<Recipe>`;

    const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
    });
    console.log(response.text);
}

main();

Proporciona un esquema a través de la configuración del modelo
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "GEMINI_API_KEY" });

async function main() {
    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: 'List 3 popular cookie recipes.',
        config: {
            responseMimeType: 'application/json',
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        'recipeName': {
                            type: Type.STRING,
                            description: 'Name of the recipe',
                            nullable: false,
                        },
                    },
                    required: ['recipeName'],
                },
            },
        },
    });

    console.debug(response.text);
}

main();

Más información sobre los esquemas JSON
Esta es una representación pseudo-JSON de todos los campos Schema:


{
  "type": enum (Type),
  "format": string,
  "description": string,
  "nullable": boolean,
  "enum": [
    string
  ],
  "maxItems": string,
  "minItems": string,
  "properties": {
    string: {
      object (Schema)
    },
    ...
  },
  "required": [
    string
  ],
  "propertyOrdering": [
    string
  ],
  "items": {
    object (Schema)
  }
}

Estos son algunos ejemplos de esquemas que muestran combinaciones válidas de tipo y campo:
{ "type": "string", "enum": ["a", "b", "c"] }

{ "type": "string", "format": "date-time" }

{ "type": "integer", "format": "int64" }

{ "type": "number", "format": "double" }

{ "type": "boolean" }

{ "type": "array", "minItems": 3, "maxItems": 3, "items": { "type": ... } }

{ "type": "object",
  "properties": {
    "a": { "type": ... },
    "b": { "type": ... },
    "c": { "type": ... }
  },
  "nullable": true,
  "required": ["c"],
  "propertyOrdering": ["c", "b", "a"]
}

Llamadas a funciones con la API de Gemini
https://ai.google.dev/gemini-api/docs/function-calling?hl=es-419&example=meeting

import { GoogleGenAI, Type } from '@google/genai';

// Configure the client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Define the function declaration for the model
const scheduleMeetingFunctionDeclaration = {
  name: 'schedule_meeting',
  description: 'Schedules a meeting with specified attendees at a given time and date.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      attendees: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'List of people attending the meeting.',
      },
      date: {
        type: Type.STRING,
        description: 'Date of the meeting (e.g., "2024-07-29")',
      },
      time: {
        type: Type.STRING,
        description: 'Time of the meeting (e.g., "15:00")',
      },
      topic: {
        type: Type.STRING,
        description: 'The subject or topic of the meeting.',
      },
    },
    required: ['attendees', 'date', 'time', 'topic'],
  },
};

// Send request with function declarations
const response = await ai.models.generateContent({
  model: 'gemini-2.0-flash',
  contents: 'Schedule a meeting with Bob and Alice for 03/27/2025 at 10:00 AM about the Q3 planning.',
  config: {
    tools: [{
      functionDeclarations: [scheduleMeetingFunctionDeclaration]
    }],
  },
});

// Check for function calls in the response
if (response.functionCalls && response.functionCalls.length > 0) {
  const functionCall = response.functionCalls[0]; // Assuming one function call
  console.log(`Function to call: ${functionCall.name}`);
  console.log(`Arguments: ${JSON.stringify(functionCall.args)}`);
  // In a real app, you would call your actual function here:
  // const result = await scheduleMeeting(functionCall.args);
} else {
  console.log("No function call found in the response.");
  console.log(response.text);
}

Paso 1: Define la declaración de la función
import { Type } from '@google/genai';

// Define a function that the model can call to control smart lights
const setLightValuesFunctionDeclaration = {
  name: 'set_light_values',
  description: 'Sets the brightness and color temperature of a light.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      brightness: {
        type: Type.NUMBER,
        description: 'Light level from 0 to 100. Zero is off and 100 is full brightness',
      },
      color_temp: {
        type: Type.STRING,
        enum: ['daylight', 'cool', 'warm'],
        description: 'Color temperature of the light fixture, which can be `daylight`, `cool` or `warm`.',
      },
    },
    required: ['brightness', 'color_temp'],
  },
};

/**
* Set the brightness and color temperature of a room light. (mock API)
* @param {number} brightness - Light level from 0 to 100. Zero is off and 100 is full brightness
* @param {string} color_temp - Color temperature of the light fixture, which can be `daylight`, `cool` or `warm`.
* @return {Object} A dictionary containing the set brightness and color temperature.
*/
function setLightValues(brightness, color_temp) {
  return {
    brightness: brightness,
    colorTemperature: color_temp
  };
}

Paso 2: Llama al modelo con declaraciones de funciones
import { GoogleGenAI } from '@google/genai';

// Generation Config with Function Declaration
const config = {
  tools: [{
    functionDeclarations: [setLightValuesFunctionDeclaration]
  }]
};

// Configure the client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Define user prompt
const contents = [
  {
    role: 'user',
    parts: [{ text: 'Turn the lights down to a romantic level' }]
  }
];

// Send request with function declarations
const response = await ai.models.generateContent({
  model: 'gemini-2.0-flash',
  contents: contents,
  config: config
});

console.log(response.functionCalls[0]); 

Luego, el modelo muestra un objeto functionCall en un esquema compatible con OpenAPI que especifica cómo llamar a una o más de las funciones declaradas para responder a la pregunta del usuario.
{
  name: 'set_light_values',
  args: { brightness: 25, color_temp: 'warm' }
}

Paso 3: Ejecuta el código de la función set_light_values
// Extract tool call details
const tool_call = response.functionCalls[0]

let result;
if (tool_call.name === 'set_light_values') {
  result = setLightValues(tool_call.args.brightness, tool_call.args.color_temp);
  console.log(`Function execution result: ${JSON.stringify(result)}`);
}

Paso 4: Crea una respuesta fácil de usar con el resultado de la función y vuelve a llamar al modelo
// Create a function response part
const function_response_part = {
  name: tool_call.name,
  response: { result }
}

// Append function call and result of the function execution to contents
contents.push({ role: 'model', parts: [{ functionCall: tool_call }] });
contents.push({ role: 'user', parts: [{ functionResponse: function_response_part }] });

// Get the final response from the model
const final_response = await ai.models.generateContent({
  model: 'gemini-2.0-flash',
  contents: contents,
  config: config
});

console.log(final_response.text);

Declaraciones de funciones
https://ai.google.dev/gemini-api/docs/function-calling?hl=es-419&example=meeting#function_declarations
Cuando implementas la llamada a función en una instrucción, creas un objeto tools, que contiene uno o más function declarations. Las funciones se definen con JSON, específicamente con un subconjunto seleccionado del formato de esquema de OpenAPI. Una sola declaración de función puede incluir los siguientes parámetros:

name (cadena): Es un nombre único para la función (get_weather_forecast, send_email). Usa nombres descriptivos sin espacios ni caracteres especiales (usa guiones bajos o mayúsculas y minúsculas).
description (cadena): Una explicación clara y detallada del propósito y las capacidades de la función. Esto es fundamental para que el modelo comprenda cuándo usar la función. Sé específico y proporciona ejemplos si es útil ("Encuentra cines en función de la ubicación y, de manera opcional, el título de la película que se está proyectando en los cines").
parameters (objeto): Define los parámetros de entrada que espera la función.
type (cadena): Especifica el tipo de datos general, como object.
properties (objeto): Muestra una lista de parámetros individuales, cada uno con lo siguiente:
type (cadena): Es el tipo de datos del parámetro, como string, integer, boolean, array.
description (cadena): Es una descripción del propósito y el formato del parámetro. Proporciona ejemplos y restricciones ("La ciudad y el estado, p.ej., "San Francisco, CA" o un código postal, p.ej., '95616'.").
enum (array, opcional): Si los valores de los parámetros provienen de un conjunto fijo, usa "enum" para enumerar los valores permitidos en lugar de solo describirlos en la descripción. Esto mejora la precisión ("enum": ["daylight", "cool", "warm"]).
required (array): Es un array de cadenas que enumera los nombres de los parámetros que son obligatorios para que funcione la función.

Llamadas a función en paralelo
import { Type } from '@google/genai';

const powerDiscoBall = {
  name: 'power_disco_ball',
  description: 'Powers the spinning disco ball.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      power: {
        type: Type.BOOLEAN,
        description: 'Whether to turn the disco ball on or off.'
      }
    },
    required: ['power']
  }
};

const startMusic = {
  name: 'start_music',
  description: 'Play some music matching the specified parameters.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      energetic: {
        type: Type.BOOLEAN,
        description: 'Whether the music is energetic or not.'
      },
      loud: {
        type: Type.BOOLEAN,
        description: 'Whether the music is loud or not.'
      }
    },
    required: ['energetic', 'loud']
  }
};

const dimLights = {
  name: 'dim_lights',
  description: 'Dim the lights.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      brightness: {
        type: Type.NUMBER,
        description: 'The brightness of the lights, 0.0 is off, 1.0 is full.'
      }
    },
    required: ['brightness']
  }
};

Llama al modelo con una instrucción que pueda usar todas las herramientas especificadas. En este ejemplo, se usa un tool_config. Para obtener más información, puedes leer sobre cómo configurar llamadas a funciones.
import { GoogleGenAI } from '@google/genai';

// Set up function declarations
const houseFns = [powerDiscoBall, startMusic, dimLights];

const config = {
    tools: [{
        functionDeclarations: houseFns
    }],
    // Force the model to call 'any' function, instead of chatting.
    toolConfig: {
        functionCallingConfig: {
        mode: 'any'
        }
    }
};

// Configure the client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Create a chat session
const chat = ai.chats.create({
    model: 'gemini-2.0-flash',
    config: config
});
const response = await chat.sendMessage({message: 'Turn this place into a party!'});

// Print out each of the function calls requested from this single call
console.log("Example 1: Forced function calling");
for (const fn of response.functionCalls) {
    const args = Object.entries(fn.args)
        .map(([key, val]) => `${key}=${val}`)
        .join(', ');
    console.log(`${fn.name}(${args})`);
}


Comprensión de documentos
Entrada de PDF
https://ai.google.dev/gemini-api/docs/document-processing?hl=es-419&lang=node#pdf-input
PDFs almacenados de forma local
import { GoogleGenAI } from "@google/genai";
import * as fs from 'fs';

const ai = new GoogleGenAI({ apiKey: "GEMINI_API_KEY" });

async function main() {
    const contents = [
        { text: "Summarize this document" },
        {
            inlineData: {
                mimeType: 'application/pdf',
                data: Buffer.from(fs.readFileSync("content/343019_3_art_0_py4t4l_convrt.pdf")).toString("base64")
            }
        }
    ];

    const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: contents
    });
    console.log(response.text);
}

main();

Comprensión de imágenes
Archivo de imagen local:
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({ apiKey: "GOOGLE_API_KEY" });
const base64ImageFile = fs.readFileSync("path/to/small-sample.jpg", {
  encoding: "base64",
});

const contents = [
  {
    inlineData: {
      mimeType: "image/jpeg",
      data: base64ImageFile,
    },
  },
  { text: "Caption this image." },
];

const response = await ai.models.generateContent({
  model: "gemini-2.0-flash",
  contents: contents,
});
console.log(response.text);

Comprensión de audio

Audio de entrada para archivos en local:

import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({ apiKey: "GOOGLE_API_KEY" });
const base64AudioFile = fs.readFileSync("path/to/small-sample.mp3", {
  encoding: "base64",
});

const contents = [
  { text: "Please summarize the audio." },
  {
    inlineData: {
      mimeType: "audio/mp3",
      data: base64AudioFile,
    },
  },
];

const response = await ai.models.generateContent({
  model: "gemini-2.0-flash",
  contents: contents,
});
console.log(response.text);

Cómo obtener una transcripción
import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "GOOGLE_API_KEY" });
const myfile = await ai.files.upload({
  file: "path/to/sample.mp3",
  config: { mimeType: "audio/mpeg" },
});

const result = await ai.models.generateContent({
  model: "gemini-2.0-flash",
  contents: createUserContent([
    createPartFromUri(myfile.uri, myfile.mimeType),
    "Generate a transcript of the speech.",
  ]),
});
console.log("result.text=", result.text);

Comprensión de videos
import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({ apiKey: "GOOGLE_API_KEY" });
const base64VideoFile = fs.readFileSync("path/to/small-sample.mp4", {
  encoding: "base64",
});

const contents = [
  {
    inlineData: {
      mimeType: "video/mp4",
      data: base64VideoFile,
    },
  },
  { text: "Please summarize the video in 3 sentences." }
];

const response = await ai.models.generateContent({
  model: "gemini-2.0-flash",
  contents: contents,
});
console.log(response.text);

https://ai.google.dev/gemini-api/docs/text-generation?hl=es-419

Generación de texto:

https://ai.google.dev/gemini-api/docs/text-generation?hl=es-419#text-input
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "GEMINI_API_KEY" });

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: "How does AI work?",
  });
  console.log(response.text);
}

await main();

https://ai.google.dev/gemini-api/docs/text-generation?hl=es-419#image-input
import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "GEMINI_API_KEY" });

async function main() {
  const image = await ai.files.upload({
    file: "/path/to/organ.png",
  });
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      createUserContent([
        "Tell me about this instrument",
        createPartFromUri(image.uri, image.mimeType),
      ]),
    ],
  });
  console.log(response.text);
}

await main();

https://ai.google.dev/gemini-api/docs/text-generation?hl=es-419#streaming-output
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "GEMINI_API_KEY" });

async function main() {
  const response = await ai.models.generateContentStream({
    model: "gemini-2.0-flash",
    contents: "Explain how AI works",
  });

  for await (const chunk of response) {
    console.log(chunk.text);
  }
}

await main();

https://ai.google.dev/gemini-api/docs/text-generation?hl=es-419#multi-turn-conversations
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "GEMINI_API_KEY" });

async function main() {
  const chat = ai.chats.create({
    model: "gemini-2.0-flash",
    history: [
      {
        role: "user",
        parts: [{ text: "Hello" }],
      },
      {
        role: "model",
        parts: [{ text: "Great to meet you. What would you like to know?" }],
      },
    ],
  });

  const response1 = await chat.sendMessage({
    message: "I have 2 dogs in my house.",
  });
  console.log("Chat response 1:", response1.text);

  const response2 = await chat.sendMessage({
    message: "How many paws are in my house?",
  });
  console.log("Chat response 2:", response2.text);
}

await main();

También se puede usar la transmisión con chat, como se muestra en el siguiente ejemplo:

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "GEMINI_API_KEY" });

async function main() {
  const chat = ai.chats.create({
    model: "gemini-2.0-flash",
    history: [
      {
        role: "user",
        parts: [{ text: "Hello" }],
      },
      {
        role: "model",
        parts: [{ text: "Great to meet you. What would you like to know?" }],
      },
    ],
  });

  const stream1 = await chat.sendMessageStream({
    message: "I have 2 dogs in my house.",
  });
  for await (const chunk of stream1) {
    console.log(chunk.text);
    console.log("_".repeat(80));
  }

  const stream2 = await chat.sendMessageStream({
    message: "How many paws are in my house?",
  });
  for await (const chunk of stream2) {
    console.log(chunk.text);
    console.log("_".repeat(80));
  }
}

await main();


https://ai.google.dev/gemini-api/docs/text-generation?hl=es-419#configuration-parameters

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "GEMINI_API_KEY" });

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: "Explain how AI works",
    config: {
      maxOutputTokens: 500,
      temperature: 0.1,
    },
  });
  console.log(response.text);
}

await main();


https://ai.google.dev/gemini-api/docs/text-generation?hl=es-419#system-instructions

import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "GEMINI_API_KEY" });

async function main() {
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: "Hello there",
    config: {
      systemInstruction: "You are a cat. Your name is Neko.",
    },
  });
  console.log(response.text);
}

await main();