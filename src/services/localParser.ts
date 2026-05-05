import { RadioScript } from '../types';

export function parseScriptLocally(inputText: string): RadioScript | null {
    // Dividir por líneas y descartar vacías
    const paragraphs = inputText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    
    // Detect if it starts with "MONOLOGO"
    let isMonologo = false;
    if (paragraphs.length > 0) {
        const firstPFlat = paragraphs[0].replace(/<[^>]+>/g, '').trim().toUpperCase();
        if (firstPFlat.startsWith('MONOLOGO') || firstPFlat.startsWith('MONÓLOGO')) {
            isMonologo = true;
        }
    }
    
    // First pass: Identify dynamic speaker names that are numbered explicitly or known
    const knownSpeakers = new Set<string>(['LOC', 'LOCUTOR', 'LOCUTORA', 'PERIODISTA', 'ANIMADOR', 'ANIMADORA']);
    for (const p of paragraphs) {
        const flatP = p.replace(/<[^>]+>/g, '');
        // En primer lugar intentamos atrapar los que tienen formato con dos puntos
        const docNameMatch = flatP.match(/^[\(]?(\d+)[\)]?[\s.-]*([^:.]+)[.:]+\s*(.*)$/i);
        if (docNameMatch) {
            const name = docNameMatch[2].trim().toUpperCase();
            if (name.length < 25) {
                knownSpeakers.add(name);
            }
        } else {
             // En segundo lugar intentamos atrapar los que empiezan por numero e inmediatamente el nombre en mayuscula (ej. "02 LUIS")
             const numMatch = flatP.match(/^[\(]?(\d+)[\)]?[\s.-]*([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{2,30})\b/i);
             if (numMatch) {
                 const potentialName = numMatch[2].trim().toUpperCase();
                 if (potentialName && !/^(SON|SONIDO|OP|EFECTO|MÚSICA|CREDITOS|PÁGINA)$/i.test(potentialName)) {
                     knownSpeakers.add(potentialName);
                 }
             }
        }
    }

    // Main parsing loop variables
    const credits: {label: string, value: string}[] = [];
    const body: any[] = [];
    
    let parsingCredits = true;
    let foundValidContent = false;
    
    // Helper to find the index in the original string that corresponds to a flat index
    const getOriginalIndex = (original: string, flatIndex: number): number => {
        let flatCount = 0;
        let originalIdx = 0;
        while (originalIdx < original.length && flatCount < flatIndex) {
            if (original[originalIdx] === '<') {
                while (originalIdx < original.length && original[originalIdx] !== '>') originalIdx++;
                originalIdx++;
            } else {
                flatCount++;
                originalIdx++;
            }
        }
        return originalIdx;
    };
    
    for (const p of paragraphs) {
        // Omitir números de página sueltos
        const flatP = p.replace(/<[^>]+>/g, '');
        if (/^(?:P\u00e1gina|Page\s*)?\d+$/i.test(flatP)) {
            continue;
        }

        // Matcher para sonido: OJO, no exigimos dos puntos aquí para hacerlo robusto
        const soundMatch = flatP.match(/^[\(]?([IVXLCDM]*|[\d]*)[\)]?[\s.:]*(SON|SONIDO|OP|EFECTO|MÚSICA)\b[^\w]*(.*)$/i);
        if (soundMatch) {
            let id = (soundMatch[1] || "").trim();
            const kw = soundMatch[2].toUpperCase();
            const textAfter = (soundMatch[3] || "").trim();
            const textAfterPlain = textAfter.replace(/<[^>]+>/g, '').trim();
            
            let isActualSound = false;
            const isRoman = id.length > 0 && /^[IVXLCDM]+$/i.test(id);
            const isArabic = id.length > 0 && /^\d+$/.test(id);
            
            if (kw === 'EFECTO' || kw === 'MÚSICA') {
                // Estos keywords siempre se consideran sonidos/órdenes técnicas
                isActualSound = true;
            } else if (isRoman && (kw === 'SON' || kw === 'SONIDO' || kw === 'OP')) {
                // Regla 1: Numero romano + (SON | SONIDO | OP)
                isActualSound = true;
            } else if (kw === 'SON' || kw === 'SONIDO') {
                // Regla 2: SON/SONIDO + Mayúsculas (si no hay ID o si el ID no es romano)
                // Usamos el texto tras el término para decidir si es una orden o texto narrativo
                const alphaOnly = textAfterPlain.replace(/[^a-zA-ZÁÉÍÓÚÑáéíóúñ]/g, '');
                if (alphaOnly.length > 0) {
                    if (alphaOnly === alphaOnly.toUpperCase()) {
                        isActualSound = true;
                    }
                } else if (textAfterPlain.length > 0 || isArabic) {
                    // Si no hay letras pero hay algo (puntos, etc), o si tiene un ID arábigo suele ser orden técnica
                    isActualSound = true;
                } else if (soundMatch[2] === soundMatch[2].toUpperCase()) {
                    // Si no hay nada después pero la palabra está en mayúsculas (ej: "SON")
                    isActualSound = true;
                }
            } else if (kw === 'OP') {
                // OP sin número romano: solo si parece una orden técnica (ej. OP 1, o OP.)
                if (isArabic || id === "" || textAfterPlain.length > 0) {
                    isActualSound = true;
                }
            }
            
            if (isActualSound) {
                parsingCredits = false;
                foundValidContent = true;
                
                // Get original remaining text with tags
                const headerLength = flatP.length - (soundMatch[3] ? soundMatch[3].length : 0);
                const originalOffset = getOriginalIndex(p, headerLength);
                let remainingText = p.substring(originalOffset).trim();
                
                body.push({
                    type: 'sound',
                    identifier: id.toUpperCase(),
                    text: [remainingText]
                });
                continue;
            }
        }
        
        let handledSpeaker = false;
        let isSpeaker = false;
        let id = "";
        let name = "";
        let speakerOriginalName = "";
        let intention = "";
        let textExtracted = "";

        // Attempt format 1: explicitly has colon/dot acting as separator for a short name
        const colonMatch = flatP.match(/^[\(]?(\d*)[\)]?[\s.-]*([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s]{1,30})[.:]+\s*(?:\(([^)]+)\))?\s*(.*)$/i);
        if (colonMatch) {
            id = colonMatch[1];
            let originalNamePart = colonMatch[2].trim();
            name = originalNamePart.toUpperCase();
            intention = colonMatch[3] ? colonMatch[3].trim().toUpperCase() : "";
            isSpeaker = true;
            speakerOriginalName = originalNamePart;
            
            const headerLength = flatP.length - (colonMatch[4] ? colonMatch[4].length : 0);
            const originalOffset = getOriginalIndex(p, headerLength);
            textExtracted = p.substring(originalOffset).trim();
        } else {
            // Attempt format 2: No colon, but explicit number + known speaker OR intention OR uppercase short name
            const noColonMatch = flatP.match(/^[\(]?(\d+)[\)]?[\s.-]*([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{2,40})\b\s*(?:\(([^)]+)\))?\s*(.*)$/i);
            if (noColonMatch) {
                let originalNamePart = noColonMatch[2].trim();
                let tempName = originalNamePart.toUpperCase();
                
                const isAllUpperCase = tempName === originalNamePart;
                const hasIntention = !!noColonMatch[3];
                const cleanWordsCount = tempName.split(' ').filter(w => w.length > 0).length;

                // Consider it a speaker if it's a known speaker, OR it has an intention like (REFLEXIVO), OR it's uppercase and short
                if (knownSpeakers.has(tempName) || hasIntention || (isAllUpperCase && cleanWordsCount <= 4)) {
                    id = noColonMatch[1];
                    name = tempName;
                    intention = noColonMatch[3] ? noColonMatch[3].trim().toUpperCase() : "";
                    isSpeaker = true;
                    speakerOriginalName = originalNamePart;
                    
                    const headerLength = flatP.length - (noColonMatch[4] ? noColonMatch[4].length : 0);
                    const originalOffset = getOriginalIndex(p, headerLength);
                    textExtracted = p.substring(originalOffset).trim();
                }
            } else {
                // Attempt format 3: No number, no colon, but STARTS EXACTLY with a known speaker
                const knownArray = Array.from(knownSpeakers).sort((a,b)=>b.length-a.length).join('|');
                if (knownArray.length > 0) {
                    const knownMatch = flatP.match(new RegExp(`^(${knownArray})\\b\\s*(?:\\(([^)]+)\\))?\\s*(.*)$`, 'i'));
                    if (knownMatch) {
                        id = "";
                        let originalNamePart = knownMatch[1].trim();
                        name = originalNamePart.toUpperCase();
                        intention = knownMatch[2] ? knownMatch[2].trim().toUpperCase() : "";
                        isSpeaker = true;
                        speakerOriginalName = originalNamePart;
                        
                        const headerLength = flatP.length - (knownMatch[3] ? knownMatch[3].length : 0);
                        const originalOffset = getOriginalIndex(p, headerLength);
                        textExtracted = p.substring(originalOffset).trim();
                    }
                }
            }
        }
        
        if (isSpeaker) {
            const isCreditLabel = name.match(/^(EMISORA|PROGRAMA|EMISI[OÓ]N|FECHA|FECHA DE TRANSMISI[OÓ]N|FECHA DE GRABACI[OÓ]N|ESCRIBE|ESCRITOR|GUI[OÓ]N|GUION|ASESOR|ASESORA|DIRIGE|DIRECTOR|DIRECCI[OÓ]N|DIRECCI[OÓ]N GENERAL|REDACCI[OÓ]N|TEMA|REALIZADOR|REALIZADOR DE SONIDO|REALIZADOR DE SONIDOS|LOCUTOR|LOCUTORA|LOC|SECCI[OÓ]N|ACTOR|ACTRIZ|T[ÍI]TULO|FORMATO)$/);
            
            const isSpeakerRole = /^(LOCUTOR|LOCUTORA|LOC|ACTOR|ACTRIZ|ANIMADOR|ANIMADORA|PERIODISTA)$/i.test(name);

            if (isCreditLabel && (!id || id.trim() === '')) {
                if (isSpeakerRole) {
                    if (parsingCredits && textExtracted.length < 100) {
                        // Si estamos en zona de créditos y el texto es corto, es un crédito (ej. LOCUTOR: Pedro)
                        isSpeaker = false;
                    }
                } else {
                    // No es un rol de hablante (ej. PROGRAMA, TEMA), siempre es crédito
                    isSpeaker = false; 
                }
            } else if (parsingCredits && !id && name.length > 25) {
                isSpeaker = false;
            } else if (parsingCredits && !id && !knownSpeakers.has(name) && !isCreditLabel) {
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
            const creditMatch = flatP.match(/^([a-zA-ZÁÉÍÓÚáéíóúñÑ\s\(\)]+):\s*(.*)$/i);
            const kwMatch = flatP.match(/^(EMISORA|PROGRAMA|EMISI[OÓ]N|FECHA(?: DE TRANSMISI[OÓ]N| DE GRABACI[OÓ]N)?|ESCRIBE|ESCRITOR|GUI[OÓ]N|GUION|ASESOR|ASESORA|DIRIGE|DIRECTOR|TEMA|REALIZADOR(?: DE SONIDO| DE SONIDOS)?|LOC(?:UTOR|UTORA)?|SECCI[OÓ]N|ACTOR|ACTRIZ|T[ÍI]TULO|FORMATO)\b[\s:.-]*(.*)$/i);

            if (kwMatch) {
                // Get original value with tags
                const labelInFlat = kwMatch[1];
                const headerLength = flatP.indexOf(kwMatch[2], labelInFlat.length);
                const originalOffset = getOriginalIndex(p, headerLength);
                let val = p.substring(originalOffset).trim();
                
                // Limpiar el valor si empieza por ":" o "." accidentalmente
                let textVal = val.replace(/<[^>]+>/g, '').trim();
                let failsafe = 0;
                while ((textVal.startsWith(':') || textVal.startsWith('.')) && failsafe < 20) {
                    const firstCharIdx = val.search(/[:.]/);
                    if (firstCharIdx !== -1) {
                        val = val.substring(0, firstCharIdx) + val.substring(firstCharIdx + 1);
                        val = val.trim();
                    } else {
                        break;
                    }
                    textVal = val.replace(/<[^>]+>/g, '').trim();
                    failsafe++;
                }

                credits.push({
                    label: kwMatch[1].trim().toUpperCase(),
                    value: val
                });
                continue;
            } else if (creditMatch && creditMatch[1].length < 40) {
                const headerLength = flatP.indexOf(':') + 1;
                const originalOffset = getOriginalIndex(p, headerLength);
                credits.push({
                    label: creditMatch[1].trim().toUpperCase(),
                    value: p.substring(originalOffset).trim()
                });
                continue;
            }
        }
        
        // Párrafo de continuación (si pertenece a la intervención anterior)
        if (!parsingCredits) {
            // Check if it's a misplaced credit label
            const isCreditLabel = flatP.match(/^(EMISORA|PROGRAMA|EMISI[OÓ]N|FECHA(?: DE TRANSMISI[OÓ]N| DE GRABACI[OÓ]N)?|ESCRIBE|ESCRITOR|GUI[OÓ]N|GUION|ASESOR|ASESORA|DIRIGE|DIRECTOR|TEMA|REALIZADOR(?: DE SONIDO| DE SONIDOS)?|SECCI[OÓ]N|T[ÍI]TULO|FORMATO)\b[\s:.-]/i);
            
            if (isCreditLabel) {
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
        } else {
            // En zona de créditos, pero la línea no coincidió con ninguna etiqueta.
            // Si ya tenemos créditos, se asume que es una continuación del valor anterior.
            if (credits.length > 0) {
                credits[credits.length - 1].value += ' ' + p;
            } else if (p.trim().length > 0) {
                const flatP = p.replace(/<[^>]+>/g, '').trim();
                if (flatP.length < 50 && !flatP.includes(':') && /^(MON[OÓ]LOGO|REPORTAJE|ENTREVISTA|CR[OÓ]NICA|RADIOTEATRO|DOCUMENTAL)$/i.test(flatP)) {
                    credits.push({
                        label: 'FORMATO',
                        value: p.trim()
                    });
                    continue; // Stay in parsingCredits mode
                }
                
                // Si hay texto ANTES del primer crédito, podríamos forzar su entrada al body y desactivar parsingCredits
                parsingCredits = false;
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
        'FORMATO',
        'EMISORA',
        'PROGRAMA',
        'EMISIÓN', // Nuevo campo solicitado
        'SECCIÓN',
        'TÍTULO',
        'ESCRIBE',
        'ESCRITOR',
        'ASESOR',
        'ASESORA',
        'DIRECTOR',
        'DIRECCIÓN',
        'DIRECCIÓN GENERAL',
        'REDACCIÓN',
        'REALIZADOR (A) DE SONIDO', // Formato con (A)
        'LOCUTOR',
        'LOCUTORA',
        'ACTOR',
        'ACTRIZ',
        'FECHA DE TRANSMISIÓN',
        'FECHA DE GRABACIÓN', // Nuevo campo solicitado
        'FECHA',
        'TEMA'
    ];

    // Helper to detect gender from a name
    const detectGender = (name: string): 'M' | 'F' | 'U' => {
        const n = name.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (!n) return 'U';
        
        // Use first word (first name) for cleaner detection
        const firstName = n.split(/\s+/)[0];
        
        // common masculine names and endings
        if (/^(LUIS|JOSE|JUAN|RAFAEL|PEDRO|CARLOS|MANUEL|ROBERTO|ALBERTO|DANIEL|JAVIER|VICENTE|RUBEN|ABEL|MIGUEL|EDUARDO|OSCAR|ANGEL|YUNIER|YANDY|YASSEL)$/.test(firstName)) return 'M';
        if (firstName.endsWith('O') || firstName.endsWith('S') && !firstName.endsWith('AS')) {
            if (/^(MARIA|INES|ANAYS|LOURDES|CARIDAD)$/.test(firstName)) return 'F';
            return 'M';
        }
        
        // common feminine names and endings
        if (/^(MARIA|ANA|LAURA|CARIDAD|LISSELL|CARID|CARMEN|ROSA|ELENA|LUCIA|MARTA|SILVIA|BEATRIZ|INES)$/.test(firstName)) return 'F';
        if (firstName.endsWith('A') || firstName.endsWith('AS')) {
            if (/^(BATTISTA|GARCIA)$/.test(firstName)) return 'U'; // Just in case
            return 'F';
        }
        
        return 'U';
    };

    // Helper to find and normalize labels
    const findAndNormalize = (label: string, value: string) => {
        let cleanLabel = label.toUpperCase().trim();
        let cleanValue = value.trim();

        if (cleanLabel === 'LOC') {
            cleanLabel = 'LOCUTOR';
        }

        // Gender adjustment for specific labels
        if (['LOCUTOR', 'LOCUTORA', 'ASESOR', 'ASESORA', 'DIRECTOR', 'DIRECTORA', 'ESCRITOR', 'ESCRITORA'].includes(cleanLabel)) {
            const gender = detectGender(cleanValue);
            if (gender === 'M') {
                if (cleanLabel.endsWith('ORA')) cleanLabel = cleanLabel.substring(0, cleanLabel.length - 1); // LOCUTORA -> LOCUTOR
                else if (cleanLabel.endsWith('A')) cleanLabel = cleanLabel.substring(0, cleanLabel.length - 1); // ESCRITORA -> ESCRITOR
            } else if (gender === 'F') {
                if (cleanLabel.endsWith('OR') && !cleanLabel.endsWith('ORA')) cleanLabel = cleanLabel + 'A'; // LOCUTOR -> LOCUTORA
                else if (cleanLabel === 'ESCRITOR') cleanLabel = 'ESCRITORA';
            }
        }

        if (cleanLabel.includes('REALIZADOR') && cleanLabel.includes('SONIDO')) {
            const gender = detectGender(cleanValue);
            if (gender === 'M') {
                 cleanLabel = 'REALIZADOR DE SONIDO';
            } else if (gender === 'F') {
                 cleanLabel = 'REALIZADORA DE SONIDO';
            } else {
                 cleanLabel = 'REALIZADOR (A) DE SONIDO';
            }
        } else if (cleanLabel === 'REALIZADOR' || cleanLabel === 'REALIZADOR DE SONIDOS') {
            const gender = detectGender(cleanValue);
            if (gender === 'M') {
                 cleanLabel = 'REALIZADOR DE SONIDO';
            } else if (gender === 'F') {
                 cleanLabel = 'REALIZADORA DE SONIDO';
            } else {
                 cleanLabel = 'REALIZADOR (A) DE SONIDO';
            }
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
    const rawCredits = [...credits];
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

    return { isMonologo, credits: normalizedCredits, rawCredits, body };
}
