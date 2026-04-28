import { RadioScript } from './geminiService';

export function parseScriptLocally(inputText: string): RadioScript | null {
    // Dividir por líneas y descartar vacías
    const paragraphs = inputText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    
    // First pass: Identify dynamic speaker names that are numbered explicitly or known
    const knownSpeakers = new Set<string>(['LOC', 'LOCUTOR', 'LOCUTORA', 'PERIODISTA', 'ANIMADOR', 'ANIMADORA']);
    for (const p of paragraphs) {
        const docNameMatch = p.match(/^[\(]?(\d+)[\)]?[\s.-]*([^:.]+)[.:]+\s*(.*)$/i);
        if (docNameMatch) {
            const name = docNameMatch[2].trim().toUpperCase();
            // Evitar que agarre párrafos grandes por error
            if (name.length < 25) {
                knownSpeakers.add(name);
            }
        }
    }

    const credits: {label: string, value: string}[] = [];
    const body: any[] = [];
    
    let parsingCredits = true;
    let foundValidContent = false;
    
    for (const p of paragraphs) {
        // Omitir números de página sueltos
        if (/^(?:P\u00e1gina|Page\s*)?\d+$/i.test(p)) {
            continue;
        }

        // Matcher para sonido: OJO, no exigimos dos puntos aquí para hacerlo robusto
        const soundMatch = p.match(/^[\(]?([IVXLCDM]*|[\d]*)[\)]?[\s.:]*(SON|SONIDO|OP|EFECTO|MÚSICA)\b[^\w]*(.*)$/i);
        if (soundMatch) {
            parsingCredits = false;
            foundValidContent = true;
            let id = soundMatch[1] || "";
            let remainingText = soundMatch[3].trim();
            // A veces accidentalmente capturan el "SON" en el result [3] si hubo espacio antes
            body.push({
                type: 'sound',
                identifier: id.toUpperCase(),
                text: [remainingText]
            });
            continue;
        }
        
        let handledSpeaker = false;
        let isSpeaker = false;
        let id = "";
        let name = "";
        let intention = "";
        let textExtracted = "";

        // Attempt format 1: explicitly has colon/dot acting as separator for a short name
        const colonMatch = p.match(/^[\(]?(\d*)[\)]?[\s.-]*([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s]{1,30})[.:]+\s*(?:\(([^)]+)\))?\s*(.*)$/i);
        if (colonMatch) {
            id = colonMatch[1];
            name = colonMatch[2].trim().toUpperCase();
            intention = colonMatch[3] ? colonMatch[3].trim().toUpperCase() : "";
            textExtracted = colonMatch[4].trim();
            isSpeaker = true;
        } else {
            // Attempt format 2: No colon, but explicit number + known speaker
            const noColonMatch = p.match(/^[\(]?(\d+)[\)]?[\s.-]*([A-ZÁÉÍÓÚÑa-záéíóúñ]{2,15})\b\s*(?:\(([^)]+)\))?\s*(.*)$/i);
            if (noColonMatch) {
                let tempName = noColonMatch[2].trim().toUpperCase();
                // Only consider it a speaker without a colon if it's a known speaker
                if (knownSpeakers.has(tempName)) {
                    id = noColonMatch[1];
                    name = tempName;
                    intention = noColonMatch[3] ? noColonMatch[3].trim().toUpperCase() : "";
                    textExtracted = noColonMatch[4].trim();
                    isSpeaker = true;
                }
            } else {
                // Attempt format 3: No number, no colon, but STARTS EXACTLY with a known speaker
                // We order them by length so 'LOCUTOR' matches before 'LOC'
                const knownArray = Array.from(knownSpeakers).sort((a,b)=>b.length-a.length).join('|');
                if (knownArray.length > 0) {
                    const knownMatch = p.match(new RegExp(`^(${knownArray})\\b\\s*(?:\\(([^)]+)\\))?\\s*(.*)$`, 'i'));
                    if (knownMatch) {
                        id = "";
                        name = knownMatch[1].trim().toUpperCase();
                        intention = knownMatch[2] ? knownMatch[2].trim().toUpperCase() : "";
                        textExtracted = knownMatch[3].trim();
                        isSpeaker = true;
                    }
                }
            }
        }
        
        if (isSpeaker) {
            if (parsingCredits && !id && name.match(/^(EMISORA|PROGRAMA|FECHA|ESCRIBE|ASESOR|ASESORA|DIRIGE|DIRECTOR|TEMA|REALIZADOR|LOCUTOR|LOCUTORA)$/)) {
                // It's a credit, skip doing speaker logic
            } else if (parsingCredits && !id && name.length > 20) {
                // Or another stray text
            } else {
                parsingCredits = false;
                foundValidContent = true;
                if (id.length === 1) id = '0' + id;
                
                body.push({
                    type: 'speaker',
                    identifier: id, // El id puede estar vacio, normalizeService lo llenará
                    speakerName: name,
                    intention: intention || undefined,
                    text: [textExtracted]
                });
                
                handledSpeaker = true;
                continue;
            }
        }
        
        if (handledSpeaker) continue;

        // Matcher para créditos
        if (parsingCredits) {
            const creditMatch = p.match(/^([a-zA-ZÁÉÍÓÚáéíóúñÑ\s]+):\s*(.*)$/i);
            const kwMatch = p.match(/^(EMISORA|PROGRAMA|FECHA|ESCRIBE|ASESOR|ASESORA|DIRIGE|DIRECTOR|TEMA|REALIZADOR(?: DE SONIDO| DE SONIDOS)?|LOC|LOCUTOR|LOCUTORA)\b\s*(.*)$/i);

            if (creditMatch && creditMatch[1].length < 40) {
                credits.push({
                    label: creditMatch[1].trim().toUpperCase(),
                    value: creditMatch[2].trim()
                });
                continue;
            } else if (kwMatch) {
                credits.push({
                    label: kwMatch[1].trim().toUpperCase(),
                    value: kwMatch[2].trim()
                });
                continue;
            } else {
                continue; 
            }
        }
        
        // Párrafo de continuación (si pertenece a la intervención anterior)
        if (!parsingCredits) {
            if (body.length > 0) {
                body[body.length - 1].text.push(p);
            } else {
               body.push({
                   type: 'speaker',
                   identifier: '',
                   speakerName: 'LOCUTOR',
                   text: [p]
               });
            }
        }
    }
    
    // Normalizar créditos elementales (Reemplazos comunes)
    let emisoraEncontrada = false;
    credits.forEach(c => {
        if (c.label === 'REALIZADOR DE SONIDOS' || c.label === 'REALIZADOR') c.label = 'REALIZADOR DE SONIDO';
        if (c.label === 'FECHA') c.label = 'FECHA DE TRANSMISIÓN';
        if (c.label === 'EMISORA') {
            emisoraEncontrada = true;
            if (c.value.toUpperCase().includes('RADIO CIUDAD MONUMENTO') && !c.value.toUpperCase().includes('CMNL')) {
                c.value = 'CMNL RADIO CIUDAD MONUMENTO';
            } else if (!c.value || c.value.trim() === '_________________________') {
                c.value = 'CMNL RADIO CIUDAD MONUMENTO';
            } else if (c.value.toUpperCase() === 'RADIO CIUDAD MONUMENTO') {
                c.value = 'CMNL RADIO CIUDAD MONUMENTO';
            }
        }
    });

    if (!emisoraEncontrada) {
        // Find if any label or value mentions 'RADIO CIUDAD MONUMENTO'
        const hasMention = credits.some(c => 
            c.label.toUpperCase().includes('RADIO CIUDAD MONUMENTO') || 
            c.value.toUpperCase().includes('RADIO CIUDAD MONUMENTO')
        );
        if (hasMention) {
             credits.unshift({ label: 'EMISORA', value: 'CMNL RADIO CIUDAD MONUMENTO' });
        } else {
             // as requested: "SI NO ESTA LO PONES SIEMPRE ARRIBA"
             credits.unshift({ label: 'EMISORA', value: 'CMNL RADIO CIUDAD MONUMENTO' });
        }
    }

    // Si faltan etiquetas elementales, se inyectan en blanco por protocolo
    const baseLabels = ['EMISORA', 'PROGRAMA', 'REALIZADOR DE SONIDO', 'FECHA DE TRANSMISIÓN'];
    for (const req of baseLabels) {
        if (!credits.find(c => c.label.includes(req))) {
            credits.push({ label: req, value: '_________________________' });
        }
    }
    
    return { credits, body };
}
