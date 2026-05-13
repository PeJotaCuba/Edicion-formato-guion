import { RadioScript } from '../types';

export function parseScriptLocally(inputText: string): RadioScript | null {
    // Proteger negritas markdown convirtiendolas a tags html para que sobrevivan a replace(/\*/g, '')
    let htmlContext = inputText;
    htmlContext = htmlContext.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    htmlContext = htmlContext.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Dividir por líneas y descartar vacías
    const paragraphs = htmlContext.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    
    // Detect if it starts with "MONOLOGO"
    let isMonologo = false;
    if (paragraphs.length > 0) {
        const firstPFlat = paragraphs[0].replace(/<[^>]+>/g, '').replace(/\*/g, '').trim().toUpperCase();
        if (firstPFlat.startsWith('MONOLOGO') || firstPFlat.startsWith('MONÓLOGO')) {
            isMonologo = true;
        }
    }
    
    // First pass: Identify dynamic speaker names that are numbered explicitly or known
    const knownSpeakers = new Set<string>(['LOC', 'LEC', 'LOCUTOR', 'LOCUTORA', 'PERIODISTA', 'ANIMADOR', 'ANIMADORA', 'CAN', 'AMBOS', 'DUO', 'TRÍO']);
    for (const p of paragraphs) {
        const flatP = p.replace(/<[^>]+>/g, '').replace(/\*/g, '');
        // En primer lugar intentamos atrapar los que tienen formato con dos puntos
        const docNameMatch = flatP.match(/^[\(]?(\d*)[\)]?[\s.-]*([^:.]+)[.:]+\s*(.*)$/i);
        if (docNameMatch) {
            const name = docNameMatch[2].trim().toUpperCase();
            const onlyDigits = /^\d+$/.test(name);
            const isBlacklisted = /^(OPCIONES|RESPUESTA|NOTA|PREGUNTA|ATENCIÓN|OJO|SUGERENCIA)$/i.test(name);
            if (name.length > 1 && name.length < 25 && !/^(SON|SONIDO|OP|EFECTO|MÚSICA)$/i.test(name) && !onlyDigits && !isBlacklisted) {
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
        // Trim leading spaces conceptually for the matching offset (since flatP is trimmed)
        const trimmedOriginal = original.replace(/<[^>]+>/g, '').replace(/\*/g, '');
        const leadingSpacesCount = trimmedOriginal.length - trimmedOriginal.trimStart().length;
        
        let targetFlatCount = flatIndex + leadingSpacesCount;

        while (originalIdx < original.length && flatCount < targetFlatCount) {
            if (original[originalIdx] === '<') {
                while (originalIdx < original.length && original[originalIdx] !== '>') originalIdx++;
                originalIdx++;
            } else if (original[originalIdx] === '*') {
                originalIdx++; // Asterisks are removed in flatP, so they don't count towards flatCount
            } else {
                flatCount++;
                originalIdx++;
            }
        }
        return originalIdx;
    };
    
    for (const p of paragraphs) {
        // Omitir números de página sueltos
        const flatP = p.replace(/<[^>]+>/g, '').replace(/\*/g, '').trim();
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
        const colonMatch = flatP.match(/^[\(]?(\d*)[\)]?[\s.:-]*([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s]{1,30})[.:]+\s*(?:\(([^)]+)\))?\s*(.*)$/i);
        if (colonMatch) {
            let originalNamePart = colonMatch[2].trim();
            let tempName = originalNamePart.toUpperCase();
            const onlyDigits = /^\d+$/.test(tempName);
            const isBlacklisted = /^(OPCIONES|RESPUESTA|NOTA|PREGUNTA|ATENCIÓN|OJO|SUGERENCIA)$/i.test(tempName);
            const hasId = !!colonMatch[1];
            const isAllUpper = tempName === originalNamePart;
            const isKnown = knownSpeakers.has(tempName);
            
            // Un speaker válido:
            // 1. Debe tener más de 1 letra de longitud. No ser solo dígitos. No ser una palabra en la lista negra.
            // 2. Además, si no tiene número de ID y no es un speaker conocido, exigimos que esté en mayúsculas sostenidas para evitar cazar "Nosotros:" o "Y:"
            if (tempName.length > 1 && !onlyDigits && !isBlacklisted && (hasId || isKnown || isAllUpper)) {
                id = colonMatch[1];
                name = tempName;
                intention = colonMatch[3] ? colonMatch[3].trim().toUpperCase() : "";
                isSpeaker = true;
                speakerOriginalName = originalNamePart;
                
                const headerLength = flatP.length - (colonMatch[4] ? colonMatch[4].length : 0);
                const originalOffset = getOriginalIndex(p, headerLength);
                textExtracted = applyRadioTransformations(p.substring(originalOffset).trim());
            }
        }
        
        if (!isSpeaker) {
            // Attempt format 2: No colon, but explicit number + known speaker OR intention OR uppercase short name
            const noColonMatch = flatP.match(/^[\(]?(\d+)[\)]?[\s.:-]*([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s]{2,40})\b\s*(?:\(([^)]+)\))?\s*(.*)$/i);
            if (noColonMatch) {
                let originalNamePart = noColonMatch[2].trim();
                let tempName = originalNamePart.toUpperCase();
                
                const isAllUpperCase = tempName === originalNamePart;
                const hasIntention = !!noColonMatch[3];
                const cleanWordsCount = tempName.split(' ').filter(w => w.length > 0).length;
                const isBlacklisted = /^(OPCIONES|RESPUESTA|NOTA|PREGUNTA|ATENCIÓN|OJO|SUGERENCIA)$/i.test(tempName);

                // Consider it a speaker if it's a known speaker, OR it has an intention like (REFLEXIVO), OR it's uppercase and short
                if (!isBlacklisted && (knownSpeakers.has(tempName) || hasIntention || (isAllUpperCase && cleanWordsCount <= 4))) {
                    id = noColonMatch[1];
                    name = tempName;
                    intention = noColonMatch[3] ? noColonMatch[3].trim().toUpperCase() : "";
                    isSpeaker = true;
                    speakerOriginalName = originalNamePart;
                    
                    const headerLength = flatP.length - (noColonMatch[4] ? noColonMatch[4].length : 0);
                    const originalOffset = getOriginalIndex(p, headerLength);
                    textExtracted = applyRadioTransformations(p.substring(originalOffset).trim());
                }
            } else {
                // Attempt format 3: No number, no colon, but STARTS EXACTLY with a known speaker
                const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const knownArray = Array.from(knownSpeakers).sort((a,b)=>b.length-a.length).map(escapeRegExp).join('|');
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
                        textExtracted = applyRadioTransformations(p.substring(originalOffset).trim());
                    }
                }
            }
        }
        
        if (isSpeaker) {
            const isCreditLabel = name.match(/^(EMISORA|PROGRAMA|EMISI[OÓ]N|FECHA|FECHA DE TRANSMISI[OÓ]N|FECHA DE GRABACI[OÓ]N|ESCRIBE|ESCRITOR|ESCRITORA|GUI[OÓ]N|GUION|ASESOR|ASESORA|DIRIGE|DIRECTOR|DIRECTORA|DIRECCI[OÓ]N(?: GENERAL)?|REDACCI[OÓ]N|TEMA|REALIZADOR(?:A)?(?:\s*\(A\))?(?:\s*DE\s*SONIDOS?)?|REALIZACI[OÓ]N\s*DE\s*SONIDO|LOCUTOR|LOCUTORA|LOCUCI[OÓ]N|LOC|ANIMADOR|ANIMADORA|PERIODISTA|SECCI[OÓ]N|ACTOR|ACTRIZ|T[ÍI]TULO|FORMATO|NARRACI[OÓ]N|NARRADOR(?:A)?|PRODUCCI[OÓ]N|ELENCO|REPARTO|GRABACI[OÓ]N|COORDINACI[OÓ]N)$/i);
            
            const isSpeakerRole = /^(LOCUTOR|LOCUTORA|LOC|ACTOR|ACTRIZ|ANIMADOR|ANIMADORA|PERIODISTA)$/i.test(name);

            if (isCreditLabel && !intention) {
                if (isSpeakerRole) {
                    if (parsingCredits && textExtracted.length < 100 && !/[.!?]$/.test(textExtracted.trim())) {
                        // Si estamos en zona de créditos y no parece una frase completa, es el crédito.
                        isSpeaker = false;
                    }
                } else {
                    // No es un rol de hablante (ej. PROGRAMA, TEMA, DIRECCION), siempre es crédito
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
            const creditMatch = flatP.match(/^(?:[\d.-]+\s*|\(\d+\)\s*)?([a-zA-ZÁÉÍÓÚáéíóúñÑ\s\(\)]+):\s*(.*)$/i);
            const kwMatch = flatP.match(/^(?:[\d.-]+\s*|\(\d+\)\s*)?(EMISORA|PROGRAMA|EMISI[OÓ]N|FECHA(?: DE TRANSMISI[OÓ]N| DE GRABACI[OÓ]N)?|ESCRIBE|ESCRITOR|ESCRITORA|GUI[OÓ]N|GUION|ASESOR|ASESORA|DIRIGE|DIRECTOR|DIRECTORA|DIRECCI[OÓ]N(?: GENERAL)?|REDACCI[OÓ]N|TEMA|REALIZADOR(?:A)?(?:\s*\(A\))?(?:\s*DE\s*SONIDOS?)?|REALIZACI[OÓ]N\s*DE\s*SONIDO|LOC(?:UTOR|UTORA|UCI[OÓ]N)?|ANIMADOR|ANIMADORA|PERIODISTA|SECCI[OÓ]N|ACTOR|ACTRIZ|T[ÍI]TULO|FORMATO|NARRACI[OÓ]N|NARRADOR(?:A)?|PRODUCCI[OÓ]N|ELENCO|REPARTO|GRABACI[OÓ]N|COORDINACI[OÓ]N)(?:[\s:.-]+|$)(.*)$/i);

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
            const isCreditLabel = flatP.match(/^(EMISORA|PROGRAMA|EMISI[OÓ]N|FECHA(?: DE TRANSMISI[OÓ]N| DE GRABACI[OÓ]N)?|ESCRIBE|ESCRITOR|ESCRITORA|GUI[OÓ]N|GUION|ASESOR|ASESORA|DIRIGE|DIRECTOR|DIRECTORA|DIRECCI[OÓ]N(?: GENERAL)?|REDACCI[OÓ]N|TEMA|REALIZADOR(?:A)?(?:\s*\(A\))?(?:\s*DE\s*SONIDOS?)?|REALIZACI[OÓ]N\s*DE\s*SONIDO|LOC(?:UTOR|UTORA|UCI[OÓ]N)?|ANIMADOR|ANIMADORA|PERIODISTA|SECCI[OÓ]N|T[ÍI]TULO|FORMATO|NARRACI[OÓ]N|NARRADOR(?:A)?|PRODUCCI[OÓ]N|ELENCO|REPARTO|GRABACI[OÓ]N|COORDINACI[OÓ]N)\b[\s:.-]/i);
            
            if (isCreditLabel) {
                continue;
            }

            if (body.length > 0) {
                if (body[body.length - 1].type === 'speaker') {
                    body[body.length - 1].text.push(applyRadioTransformations(p));
                } else {
                    body[body.length - 1].text.push(p);
                }
            } else {
               body.push({
                   type: 'speaker',
                   identifier: '',
                   speakerName: 'LOCUTOR',
                   text: [applyRadioTransformations(p)]
               });
            }
        } else {
            // En zona de créditos, pero la línea no coincidió con ninguna etiqueta.
            // Si ya tenemos créditos, se asume que es una continuación del valor anterior.
            if (credits.length > 0) {
                credits[credits.length - 1].value += ' ' + p;
            } else if (p.trim().length > 0) {
                const flatP = p.replace(/<[^>]+>/g, '').replace(/\*/g, '').trim();
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
                    text: [applyRadioTransformations(p)]
                });
            }
        }
    }
    
    // Normalización final de créditos (Frontis)
    const normalizedCredits: {label: string, value: string, group: string}[] = [];
    const seenLabels = new Set<string>();

    const templateOrder = [
        'EMISORA',
        'PROGRAMA',
        'EMISIÓN',
        'FECHA',
        'TEMA',
        'ESCRIBE',
        'ASESORA',
        'DIRIGE',
        'REALIZACIÓN DE SONIDO',
        'LOCUCIÓN'
    ];

    // Helper to find and normalize labels
    const getGroup = (label: string) => {
        let cleanLabel = label.toUpperCase().trim();
        if (/^(LOCUTOR|LOCUTORA|LOC|LOCUCI[OÓ]N|ANIMADOR|ANIMADORA|PERIODISTA|NARRACI[OÓ]N|NARRADOR|NARRADORA)$/.test(cleanLabel)) return 'LOCUCIÓN';
        if (/^(ESCRITOR|ESCRITORA|ESCRIBE|GUI[OÓ]N|GUION|REDACCI[OÓ]N)$/.test(cleanLabel)) return 'ESCRIBE';
        if (/^(ASESOR|ASESORA)$/.test(cleanLabel)) return 'ASESORA';
        if (/^(DIRECTOR|DIRECTORA|DIRIGE|DIRECCI[OÓ]N|DIRECCI[OÓ]N GENERAL|COORDINACI[OÓ]N)$/.test(cleanLabel)) return 'DIRIGE';
        if (/^(REALIZADOR|REALIZADORA|REALIZACI[OÓ]N|GRABACI[OÓ]N)/.test(cleanLabel) || cleanLabel.includes('SONIDO')) return 'REALIZACIÓN DE SONIDO';
        if (/^(PRODUCCI[OÓ]N|ELENCO|REPARTO)$/.test(cleanLabel)) return 'TEMA'; // Group with Theme/General for context if not standard
        if (/^(FECHA DE TRANSMISI[OÓ]N|FECHA DE GRABACI[OÓ]N|FECHA)$/.test(cleanLabel)) return 'FECHA';
        if (/^PROGRAMA$/.test(cleanLabel)) return 'PROGRAMA';
        if (/^EMISI[OÓ]N$/.test(cleanLabel)) return 'EMISIÓN';
        if (/^EMISORA$/.test(cleanLabel)) return 'EMISORA';
        if (/^TEMA$/.test(cleanLabel)) return 'TEMA';
        if (/^REDACCI[OÓ]N$/.test(cleanLabel)) return 'REDACCIÓN';
        return cleanLabel;
    };

    // First, process existing credits
    const rawCredits = [...credits];
    credits.forEach(c => {
        let cleanLabel = c.label.trim();
        let cleanValue = c.value.trim();
        const group = getGroup(cleanLabel);

        if (group === 'EMISORA') {
            if (cleanValue.toUpperCase().includes('RADIO CIUDAD MONUMENTO') && !cleanValue.toUpperCase().includes('CMNL')) {
                cleanValue = 'CMNL RADIO CIUDAD MONUMENTO';
            } else if (!cleanValue || cleanValue === '_________________________') {
                cleanValue = 'CMNL RADIO CIUDAD MONUMENTO';
            }
        }
        
        // Preserve the original name in uppercase, except basic spacing fixes.
        // We track by group so we don't duplicate logic.
        if (!seenLabels.has(group)) {
            normalizedCredits.push({ label: cleanLabel, value: cleanValue, group });
            seenLabels.add(group);
        }
    });

    // Ensure all core labels exist exactly as templateOrder
    templateOrder.forEach(label => {
        if (!seenLabels.has(label)) {
            let defaultVal = '';
            if (label === 'EMISORA') defaultVal = 'CMNL RADIO CIUDAD MONUMENTO';
            normalizedCredits.push({ label, value: defaultVal, group: label });
            seenLabels.add(label);
        }
    });

    // Sort according to templateOrder
    normalizedCredits.sort((a, b) => {
        const indexA = templateOrder.indexOf(a.group);
        const indexB = templateOrder.indexOf(b.group);
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    return { isMonologo, credits: normalizedCredits.map(c => ({ label: c.label, value: c.value })), rawCredits, body };
}

const digitToWordMap: { [key: string]: string } = {
    '0': 'cero', '1': 'uno', '2': 'dos', '3': 'tres', '4': 'cuatro',
    '5': 'cinco', '6': 'seis', '7': 'siete', '8': 'ocho', '9': 'nueve'
};

function applyRadioTransformations(text: string): string {
    // 1. Preserve initial enumeration (e.g., "1. ", "(1) ", "1) ", "1- ")
    let enumPrefix = "";
    let mainContent = text;
    // We look for a number at the start followed by punctuation or parens and space
    const enumMatch = text.match(/^(\s*(?:\(?\d+\)?[\.\s-]*)\s+)(.*)/);
    if (enumMatch) {
        enumPrefix = enumMatch[1];
        mainContent = enumMatch[2];
    }

    // 2. Process content piece by piece to respect HTML tags
    const parts = mainContent.split(/(<[^>]+>)/);
    for (let i = 0; i < parts.length; i++) {
        if (!parts[i].startsWith('<')) {
            let s = parts[i];

            // Rule 1898 -> Mil 898
            s = s.replace(/\b18(\d{2})\b/g, 'Mil 8$1');
            
            // Rule 19xx -> Mil 9xx (implied extension of the 18xx rule)
            s = s.replace(/\b19(\d{2})\b/g, 'Mil 9$1');

            // Rule 2006 -> Dos Mil Seis (and others 2000-2009)
            s = s.replace(/\b200([0-9])\b/g, (match, p1) => {
                if (p1 === '0') return 'Dos Mil'; // 2000
                const word = digitToWordMap[p1];
                return `Dos Mil ${word.charAt(0).toUpperCase() + word.slice(1)}`;
            });

            // Rule 2025 -> Dos Mil 25 (and others 2010-2099)
            s = s.replace(/\b20([1-9]\d)\b/g, 'Dos Mil $1');

            // Rule 0-9 -> words
            // Uses negative lookahead/lookbehind to ensure it's a single digit
            s = s.replace(/(?<![0-9])([0-9])(?![0-9])/g, (match, p1) => digitToWordMap[p1]);

            parts[i] = s;
        }
    }

    return enumPrefix + parts.join('');
}
