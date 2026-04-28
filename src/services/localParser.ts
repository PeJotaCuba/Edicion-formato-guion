import { RadioScript } from './geminiService';

export function parseScriptLocally(inputText: string): RadioScript | null {
    // Dividir por líneas y descartar vacías
    const paragraphs = inputText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    
    const credits: {label: string, value: string}[] = [];
    const body: any[] = [];
    
    let parsingCredits = true;
    let foundValidContent = false;
    
    for (const p of paragraphs) {
        // Omitir números de página sueltos (ej. "1", "2") escaneados por error en encabezados.
        if (/^(?:P\u00e1gina\s*)?\d+$/i.test(p)) {
            continue;
        }

        // Matcher para sonido: Ej. "I SON ENTRA TEMA..." o "XII SON: SUBE CIERRE..."
        const soundMatch = p.match(/^([IVXLCDM]+)[\s.:]+(SON)\b[^\w]*(.*)$/i);
        if (soundMatch) {
            parsingCredits = false;
            foundValidContent = true;
            body.push({
                type: 'sound',
                identifier: soundMatch[1].toUpperCase(),
                text: [soundMatch[3].trim()]
            });
            continue;
        }
        
        // Matcher para locutores: Ej. "01 SILVIA: (AMENO) Buenas noches..." o "12 SILVIA: Remanso..."
        const speakerMatch = p.match(/^(\d+)[\s.-]+([^:]+):\s*(?:\(([^)]+)\))?\s*(.*)$/i);
        if (speakerMatch) {
            parsingCredits = false;
            foundValidContent = true;
            body.push({
                type: 'speaker',
                identifier: speakerMatch[1],
                speakerName: speakerMatch[2].trim().toUpperCase(),
                intention: speakerMatch[3] ? speakerMatch[3].trim().toUpperCase() : undefined,
                text: [speakerMatch[4].trim()]
            });
            continue;
        }
        
        // Matcher para créditos: Ej. "EMISORA: CMKX RADIO BAYAMO"
        if (parsingCredits) {
            const creditMatch = p.match(/^([^:]+):\s*(.*)$/i);
            // Limitamos a etiquetas cortas para no confundir con texto normal de parlamento
            if (creditMatch && creditMatch[1].length < 40) {
                // Si la etiqueta existe ya (por si se duplicó), no hacemos push a menos que sea diferente, pero para mantenerlo fiel:
                credits.push({
                    label: creditMatch[1].trim().toUpperCase(),
                    value: creditMatch[2].trim()
                });
                continue;
            } else {
                // Al encontrar un texto no reconocible como crédito en la zona superior, lo ignoramos 
                // asumiendo que pueden ser subtítulos o restos sin formato. Seguimos buscando hasta un Locutor o Sonido.
                continue; 
            }
        }
        
        // Párrafo de continuación (si pertenece a la intervención anterior)
        if (!parsingCredits && body.length > 0) {
            body[body.length - 1].text.push(p);
        }
    }
    
    // Solo si encontramos al menos un patrón de guion de radio válido (Locutor o Sonido), devolverlo.
    // Si no, devolvemos null para forzar que sea analizado y adaptado por la IA.
    if (!foundValidContent) return null;
    
    // Si faltan etiquetas elementales, se inyectan en blanco por protocolo
    const baseLabels = ['EMISORA', 'PROGRAMA', 'REALIZADOR DE SONIDO', 'FECHA DE TRANSMISIÓN'];
    for (const req of baseLabels) {
        if (!credits.find(c => c.label === req)) {
            credits.push({ label: req, value: '_________________________' });
        }
    }
    
    return { credits, body };
}
