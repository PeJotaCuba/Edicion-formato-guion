import { GoogleGenAI, Type } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

function getAi(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Clave de API de Gemini no configurada. Por favor, añada la variable de entorno GEMINI_API_KEY en Vercel y vuelva a desplegar.");
  }
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export interface RadioScript {
  credits: {
    label: string;
    value: string;
  }[];
  body: {
    type: "speaker" | "sound";
    identifier: string; // "01", "02" or "I", "II"
    speakerName?: string; // "LOCUTOR" 
    intention?: string; // "ALEGRE", etc.
    text: string[];
  }[];
}

export async function generateRadioScriptJson(inputText: string): Promise<RadioScript> {
  const prompt = `Actúa como un Experto en Edición de Guiones de Radio. Tu tarea es transformar el siguiente texto o documento en un guion técnico de radio profesional.

REGLAS DE FORMATO Y ESTILO:
1. Encabezado (Créditos / Frontis): DEBE contener EXACTAMENTE estas etiquetas de orden y sin omisiones:
EMISORA
PROGRAMA
FECHA
TEMA
ESCRITOR (A)
ASESOR (A)
DIRECTOR (A)
REALIZADOR DE SONIDOS (A)
LOCUTOR (A)
IMPORTANTE SOBRE EMISORA: El nombre de la emisora SIEMPRE debe ser "CMNL RADIO CIUDAD MONUMENTO". Si el texto original dice solo "Radio Ciudad Monumento" o no menciona la emisora, complétala siempre a "CMNL RADIO CIUDAD MONUMENTO" al principio de los créditos.
Si falta información para el resto, déjala en blanco (como "_________________________").
2. Intervenciones:
  - Locutores: Numerados secuencialmente y siempre empezando por 01, 02, 03, etc. INFIERA LOS NÚMEROS Y CORRÍGELOS si están saltados o faltan.
  - El nombre del locutor va en MAYÚSCULAS y las intenciones (ej. ALEGRE, SUGERENTE) van entre paréntesis en MAYÚSCULAS y extraídas al campo "intention" en el JSON, sin unirlas al nombre.
  - Efectos/Música (Sonido): Numerados en romanos seguidos (ej. I, II, III). INFIERA LOS NÚMEROS Y CORRÍGELOS si están saltados o faltan.
  - El texto de sonido debe estar íntegramente en MAYÚSCULAS y separar acciones con doble barra (//) (ej. ENTRA TEMA // BAJA A FONDO).
3. Texto y Párrafos (CRÍTICO):
  - Conserva estrictamente las palabras y oraciones originales. No alteres, ni resumas, ni cambies palabras para NADA.
  - Si una intervención contiene varios párrafos, divídelos en un arreglo de strings (uno por cada párrafo).
  - En las órdenes de sonido, asegúrate de NO INCLUIR el identificador (ej. XII) ni la palabra "SON" dentro del texto devuelto en el campo "text".

Texto original a transformar:
${inputText}`;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      credits: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            label: { type: Type.STRING, description: "Etiqueta en mayúsculas, ej. EMISORA" },
            value: { type: Type.STRING }
          },
          required: ["label", "value"]
        }
      },
      body: {
         type: Type.ARRAY,
         items: {
           type: Type.OBJECT,
           properties: {
             type: { type: Type.STRING, description: "Debe ser 'speaker' o 'sound'" },
             identifier: { type: Type.STRING },
             speakerName: { type: Type.STRING, nullable: true },
             intention: { type: Type.STRING, nullable: true },
             text: { 
               type: Type.ARRAY, 
               items: { type: Type.STRING },
               description: "Arreglo de párrafos. Cada elemento es un párrafo del texto o instrucción."
             }
           },
           required: ["type", "identifier", "text"]
         }
      }
    },
    required: ["credits", "body"]
  };

  const response = await getAi().models.generateContent({
    model: "gemini-2.5-pro",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: responseSchema,
      temperature: 0.2
    }
  });

  const text = response.text;
  if (!text) {
    throw new Error("No response from AI");
  }

  return JSON.parse(text) as RadioScript;
}
