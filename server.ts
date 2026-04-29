import express from "express";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import WordExtractor from "word-extractor";
import * as path from "path";
import * as fs from "fs";

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use a higher limit for JSON if needed
  app.use(express.json({ limit: "10mb" }));

  // API Route for .doc extraction
  app.post("/api/extract-doc", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const extractor = new WordExtractor();
      const extract = await extractor.extract(req.file.buffer);
      const text = extract.getBody();

      res.json({ text });
    } catch (error: any) {
      console.error("Extraction error:", error);
      res.status(500).json({ error: error.message || "Error extracting document" });
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
    if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
        app.get('*', (req, res) => {
          res.sendFile(path.join(distPath, 'index.html'));
        });
    } else {
        console.warn("Dist folder not found, running in production without static files served by express.");
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
    console.error("Failed to start server:", err);
});
