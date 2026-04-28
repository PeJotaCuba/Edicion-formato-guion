import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import WordExtractor from "word-extractor";
import * as path from "path";

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API endpoints
  app.post("/api/extract-doc", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }
      let text = '';
      try {
        const extractor = new WordExtractor();
        const document = await extractor.extract(req.file.buffer);
        text = document.getBody();
      } catch (extError) {
        console.warn("word-extractor failed, using fallback manual extraction", extError);
        // Fallback para extraer el texto legible desde la codificación binaria en archivos .doc de Word 97-2003
        const decoder = new TextDecoder('windows-1252'); 
        let rawText = decoder.decode(req.file.buffer);
        
        // Eliminar nulos que separan caracteres en UTF-16LE dentro de .doc viejo
        rawText = rawText.replace(/\u0000/g, '');
        
        // Reemplazar cualquier caracter que no sea estándar ASCII, espacios o caracteres comunes españoles con un salto de línea
        const validChars = /[^a-zA-Z0-9\s.,;:'"?!¿¡()\[\]\-_áéíóúÁÉÍÓÚñÑüÜºª%@#$&+=*<>]/g;
        text = rawText.replace(validChars, '\n');
      }

      res.json({ text });
    } catch (error: any) {
      console.error("Error extracting doc:", error);
      res.status(500).json({ error: error.message || "Failed to extract doc" });
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
