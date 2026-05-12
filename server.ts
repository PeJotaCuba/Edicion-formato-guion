import express from "express";
import cors from "cors";
import path from "path";
import axios from "axios";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // API Route for DeepSeek Parsing
  app.post("/api/ai-parse", async (req, res) => {
    const { text } = req.body;
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ 
        error: "DEEPSEEK_API_KEY is not configured in the server environment." 
      });
    }

    if (!text) {
      return res.status(400).json({ error: "No text provided for parsing." });
    }

    try {
      // Prompt designed to handle the specific issues mentioned:
      // Credits, roles (Locutora), and technical orders.
      const prompt = `
Eres un experto en transcripción y estructuración de guiones radiofónicos españoles.
Tu tarea es convertir el texto de un guion radiofónico en un objeto JSON estructurado.

REGLAS CRÍTICAS DE ESTRUCTURACIÓN:
1. IDENTIFICACIÓN DE CRÉDITOS:
   - Los créditos suelen estar al inicio o final (EMISORA, PROGRAMA, DIRECCIÓN, REALIZACIÓN, FECHA, REDACCIÓN, LOCUTORES, etc.).
   - "LOCUTOR/A" en la zona de créditos identifica a la persona que habla, NO es una intervención.
   - Si dice "LOCUTORA: MARÍA GARCÍA" en los créditos, agrégalo a la sección "credits".

2. IDENTIFICACIÓN DE CUERPO (BODY):
   - Cada intervención debe tener:
     - "type": "speaker" o "sound".
     - "identifier": El número de locutor (01, 02) o vacío.
     - "speakerName": El nombre o rol (LOCUTOR, PERSONAJE, etc.).
     - "text": Un array de strings con los párrafos de su intervención.
     - "intention": (Opcional) Si hay una acotación entre paréntesis para el locutor.
   - "sound" para efectos o música (ej: (EFECTO), (CONTROL), (MÚSICA)).

3. MANEJO DE ROLES GENÉRICOS:
   - Si aparece "LOCUTORA" seguido de texto narrativo fuera de la zona de créditos, trátalo como speaker.
   - Pero primero asegúrate de que no es un crédito de "LOCUCIÓN" inicial.

FORMATO JSON ESPERADO:
{
  "credits": [
    { "label": "PROGRAMA", "value": "..." },
    { "label": "DIRECTORA", "value": "..." },
    { "label": "LOCUTORES", "value": "..." }
  ],
  "body": [
    {
      "type": "speaker",
      "identifier": "01",
      "speakerName": "LOCUTORA",
      "text": ["Hola a todos..."]
    },
    {
      "type": "sound",
      "identifier": "EFECTO",
      "text": ["Sonido de viento."]
    }
  ]
}

TEXTO DEL GUION A PROCESAR:
${text}
`;

      const response = await axios.post(
        "https://api.deepseek.com/chat/completions",
        {
          model: "deepseek-chat",
          messages: [
            { role: "system", content: "Eres un asistente especializado en procesamiento de documentos y extracción de datos estructurados. Siempre devuelves SOLO JSON válido." },
            { role: "user", content: prompt }
          ],
          temperature: 0.1
        },
        {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          }
        }
      );

      let resultText = response.data.choices[0].message.content.trim();
      
      // Clean up markdown code blocks if the model wrapped the JSON in them
      if (resultText.startsWith("```json")) {
        resultText = resultText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (resultText.startsWith("```")) {
        resultText = resultText.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      res.json(JSON.parse(resultText));
    } catch (error: any) {
      console.error("DeepSeek API Error:", error.response?.data || error.message);
      res.status(500).json({ 
        error: "Failed to communicate with DeepSeek API",
        details: error.response?.data?.error?.message || error.message
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
