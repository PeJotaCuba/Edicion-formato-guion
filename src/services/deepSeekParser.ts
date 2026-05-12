import { RadioScript } from './localParser';

export async function parseScriptWithAI(text: string): Promise<RadioScript> {
  const response = await fetch('/api/ai-parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.details || errData.error || "Error en el procesamiento con IA.");
  }

  return await response.json();
}
