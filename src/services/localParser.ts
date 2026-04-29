import { RadioScript } from '../types';

export function parseScriptLocally(inputText: string): RadioScript | null {
    // Dividir por líneas y descartar vacías
    const paragraphs = inputText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    
    // First pass: Identify dynamic speaker names that are numbered explicitly or known
    const knownSpeakers = new Set<string>(['LOC', 'LOCUTOR', 'LOCUTORA', 'PERIODISTA', 'ANIMADOR', 'ANIMADORA']);
    for (const p of paragraphs) {
        // En primer lugar intentamos atrapar los que tienen formato con dos puntos
        const docNameMatch = p.match(/^[\(]?(\d+)[\)]?[\s.-]*([^:.]+)[.:]+\s*(.*)$/i);
        if (docNameMatch) {
            const name = docNameMatch[2].trim().toUpperCase();
            if (name.length < 25) {
                knownSpeakers.add(name);
            }
        } else {
             // En segundo lugar intentamos atrapar los que empiezan por numero e inmediatamente el nombre en mayuscula (ej. "02 LUIS")
             // Aceptamos nombres compuestos de hasta 30 caracteres
             const numMatch = p.match(/^[\(]?(\d+)[\)]?[\s.-]*([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{2,30})\b/i);
             if (numMatch) {
                 const potentialName = numMatch[2].trim().toUpperCase();
                 if (potentialName && !/^(SON|SONIDO|OP|EFECTO|MÚSICA|CREDITOS|PÁGINA)$/i.test(potentialName)) {
                     knownSpeakers.add(potentialName);
                 }
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
        let speakerOriginalName = "";
        let intention = "";
        let textExtracted = "";

        // Attempt format 1: explicitly has colon/dot acting as separator for a short name
        const colonMatch = p.match(/^[\(]?(\d*)[\)]?[\s.-]*([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s]{1,30})[.:]+\s*(?:\(([^)]+)\))?\s*(.*)$/i);
        if (colonMatch) {
            id = colonMatch[1];
            let originalName = colonMatch[2].trim();
            name = originalName.toUpperCase();
            intention = colonMatch[3] ? colonMatch[3].trim().toUpperCase() : "";
            textExtracted = colonMatch[4].trim();
            isSpeaker = true;
            speakerOriginalName = originalName;
        } else {
            // Attempt format 2: No colon, but explicit number + known speaker
            const noColonMatch = p.match(/^[\(]?(\d+)[\)]?[\s.-]*([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{2,30})\b\s*(?:\(([^)]+)\))?\s*(.*)$/i);
            if (noColonMatch) {
                let originalName = noColonMatch[2].trim();
                let tempName = originalName.toUpperCase();
                // Only consider it a speaker without a colon if it's a known speaker
                if (knownSpeakers.has(tempName)) {
                    id = noColonMatch[1];
                    name = tempName;
                    intention = noColonMatch[3] ? noColonMatch[3].trim().toUpperCase() : "";
                    textExtracted = noColonMatch[4].trim();
                    isSpeaker = true;
                    speakerOriginalName = originalName;
                }
            } else {
                // Attempt format 3: No number, no colon, but STARTS EXACTLY with a known speaker
                // We order them by length so 'LOCUTOR' matches before 'LOC'
                const knownArray = Array.from(knownSpeakers).sort((a,b)=>b.length-a.length).join('|');
                if (knownArray.length > 0) {
                    const knownMatch = p.match(new RegExp(`^(${knownArray})\\b\\s*(?:\\(([^)]+)\\))?\\s*(.*)$`, 'i'));
                    if (knownMatch) {
                        id = "";
                        let originalName = knownMatch[1].trim();
                        name = originalName.toUpperCase();
                        intention = knownMatch[2] ? knownMatch[2].trim().toUpperCase() : "";
                        textExtracted = knownMatch[3].trim();
                        isSpeaker = true;
                        speakerOriginalName = originalName;
                    }
                }
            }
        }
        
        if (isSpeaker) {
            const isCreditLabel = name.match(/^(EMISORA|PROGRAMA|EMISI[OÓ]N|FECHA|FECHA DE TRANSMISI[OÓ]N|FECHA DE GRABACI[OÓ]N|ESCRIBE|ESCRITOR|GUI[OÓ]N|GUION|ASESOR|ASESORA|DIRIGE|DIRECTOR|DIRECCI[OÓ]N|DIRECCI[OÓ]N GENERAL|REDACCI[OÓ]N|TEMA|REALIZADOR|REALIZADOR DE SONIDO|REALIZADOR DE SONIDOS|LOCUTOR|LOCUTORA)$/);
            
            if (isCreditLabel && (!id || id.trim() === '')) {
                // Nunca tratar etiquetas de crédito como locutores si no tienen número explícito, 
                // incluso fuera del bloque de créditos, para evitar falsos positivos
                isSpeaker = false; 
            } else if (parsingCredits && !id && name.length > 25) {
                // Probablemente texto suelto o un párrafo que por azar tiene ":"
                isSpeaker = false;
            } else if (parsingCredits && !id && !knownSpeakers.has(name) && !isCreditLabel) {
                // Si estamos en créditos y no es un locutor conocido ni una etiqueta de crédito
                // lo tratamos como posible crédito genérico abajo
                isSpeaker = false;
            }

            if (isSpeaker) {
                parsingCredits = false;
                foundValidContent = true;
                
                let speakerId = id;
                if (speakerId && speakerId.length === 1 && !isNaN(Number(speakerId))) speakerId = '0' + speakerId;
                
                body.push({
                    type: 'speaker',
                    identifier: speakerId, 
                    speakerName: speakerOriginalName,
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
            const creditMatch = p.match(/^([a-zA-ZÁÉÍÓÚáéíóúñÑ\s\(\)]+):\s*(.*)$/i);
            const kwMatch = p.match(/^(EMISORA|PROGRAMA|EMISI[OÓ]N|FECHA(?: DE TRANSMISI[OÓ]N| DE GRABACI[OÓ]N)?|ESCRIBE|ESCRITOR|GUI[OÓ]N|GUION|ASESOR|ASESORA|DIRIGE|DIRECTOR|TEMA|REALIZADOR(?: DE SONIDO| DE SONIDOS)?|LOCUTOR|LOCUTORA)\b\s*(:?\s*.*)$/i);

            if (creditMatch && creditMatch[1].length < 40) {
                credits.push({
                    label: creditMatch[1].trim().toUpperCase(),
                    value: creditMatch[2].trim()
                });
                continue;
            } else if (kwMatch) {
                // Limpiar el valor si empieza por ":" accidentalmente (atrapado por kwMatch)
                let val = kwMatch[2].trim();
                if (val.startsWith(':')) val = val.substring(1).trim();

                credits.push({
                    label: kwMatch[1].trim().toUpperCase(),
                    value: val
                });
                continue;
            }
        }
        
        // Párrafo de continuación (si pertenece a la intervención anterior)
        if (!parsingCredits) {
            const isCreditLabel = p.match(/^(EMISORA|PROGRAMA|EMISI[OÓ]N|FECHA(?: DE TRANSMISI[OÓ]N| DE GRABACI[OÓ]N)?|ESCRIBE|ESCRITOR|GUI[OÓ]N|GUION|ASESOR|ASESORA|DIRIGE|DIRECTOR|TEMA|REALIZADOR|REALIZADOR DE SONIDO|REALIZADOR DE SONIDOS|LOCUTOR|LOCUTORA)\b\s*:/i);
            
            if (isCreditLabel) {
                // Si encontramos una etiqueta de crédito en medio del cuerpo, la ignoramos para evitar duplicados
                continue;
            }

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
    
    // Normalización final de créditos (Frontis)
    const normalizedCredits: {label: string, value: string}[] = [];
    const seenLabels = new Set<string>();

    const templateOrder = [
        'EMISORA',
        'PROGRAMA',
        'EMISIÓN', // Nuevo campo solicitado
        'ESCRIBE',
        'ESCRITOR',
        'ASESOR',
        'ASESORA',
        'DIRECTOR',
        'DIRECCIÓN',
        'DIRECCIÓN GENERAL',
        'REDACCIÓN',
        'REALIZADOR (A) DE SONIDO', // Formato con (A)
        'FECHA DE TRANSMISIÓN',
        'FECHA DE GRABACIÓN', // Nuevo campo solicitado
        'FECHA',
        'TEMA'
    ];

    // Helper to find and normalize labels
    const findAndNormalize = (label: string, value: string) => {
        let cleanLabel = label.toUpperCase().trim();
        let cleanValue = value.trim();

        if (cleanLabel.includes('REALIZADOR') && cleanLabel.includes('SONIDO')) {
            cleanLabel = 'REALIZADOR (A) DE SONIDO';
        } else if (cleanLabel === 'REALIZADOR' || cleanLabel === 'REALIZADOR DE SONIDOS') {
            cleanLabel = 'REALIZADOR (A) DE SONIDO';
        }

        if (cleanLabel === 'EMISORA') {
            if (cleanValue.toUpperCase().includes('RADIO CIUDAD MONUMENTO') && !cleanValue.toUpperCase().includes('CMNL')) {
                cleanValue = 'CMNL RADIO CIUDAD MONUMENTO';
            } else if (!cleanValue || cleanValue === '_________________________') {
                cleanValue = 'CMNL RADIO CIUDAD MONUMENTO';
            }
        }
        
        return { label: cleanLabel, value: cleanValue };
    };

    // First, process existing credits
    credits.forEach(c => {
        const normalized = findAndNormalize(c.label, c.value);
        if (!seenLabels.has(normalized.label)) {
            normalizedCredits.push(normalized);
            seenLabels.add(normalized.label);
        }
    });

    // Ensure core labels exist if they were missing (Optional, but user said "SI NO ESTA LO PONES SIEMPRE ARRIBA" for EMISORA)
    if (!seenLabels.has('EMISORA')) {
        normalizedCredits.unshift({ label: 'EMISORA', value: 'CMNL RADIO CIUDAD MONUMENTO' });
    }

    // Sort according to templateOrder
    normalizedCredits.sort((a, b) => {
        const indexA = templateOrder.indexOf(a.label);
        const indexB = templateOrder.indexOf(b.label);
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    return { credits: normalizedCredits, body };
}
