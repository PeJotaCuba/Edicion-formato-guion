import { RadioScript, ScriptItem } from '../types';

function numberToRoman(num: number): string {
    const roman = {
        M: 1000, CM: 900, D: 500, CD: 400,
        C: 100, XC: 90, L: 50, XL: 40,
        X: 10, IX: 9, V: 5, IV: 4,
        I: 1
    };
    let str = '';
    for (let i of Object.keys(roman)) {
        let q = Math.floor(num / roman[i as keyof typeof roman]);
        num -= q * roman[i as keyof typeof roman];
        str += i.repeat(q);
    }
    return str;
}

export function normalizeScriptNumbering(script: RadioScript): RadioScript {
    let soundCounter = 1;
    let speakerCounter = 1;

    // 1. Identify "Selective Numbering" candidates
    // A name is a candidate if:
    // - It is not metadata
    // - AND (it is 'LOC' or similar standard speaker OR it already had an ID in the original)
    
    const isMetadata = (name: string) => {
        const clean = name.toUpperCase().trim();
        return /^(EMISORA|PROGRAMA|EMISI[OÓ]N|FECHA|FECHA DE TRANSMISI[OÓ]N|FECHA DE GRABACI[OÓ]N|ESCRIBE|ESCRITOR|ESCRITOR \(A\)|ASESOR|ASESORA|ASESOR \(A\)|DIRECTOR|DIRECTORA|DIRECTOR \(A\)|DIRIGE|DIRECCI[OÓ]N|DIRECCI[OÓ]N GENERAL|REDACCI[OÓ]N|GUI[OÓ]N|TEMA|REALIZADOR|REALIZADOR \(A\) DE SONIDO|REALIZADOR DE SONIDO|REALIZADOR DE SONIDOS|REALIZADOR DE SONIDOS \(A\)|LOCUTOR \(A\)|NO OLVIDES|RECUERDA|CONSEJOS|ESCUCHEMOS|ESCUCHAMOS|ESCUCHE|ESCUCHEN|ATENCI[OÓ]N|IMPORTANTE)$/.test(clean) || 
               clean.startsWith('DIRECTOR') || clean.startsWith('ASESOR') || clean.startsWith('REALIZADOR') || clean.startsWith('DIRECCI[OÓ]') || clean.startsWith('FECHA DE') || clean.startsWith('NO OLVIDE') || clean.startsWith('RECUERDE') || clean.startsWith('ESCUCHE');
    };

    // First pass: detect the "Standard Speaker" (e.g. LOC or LOCUTOR)
    const speakerFreq = new Map<string, number>();
    script.body.forEach(item => {
        if (item.type === 'speaker' && item.speakerName) {
            const name = item.speakerName.toUpperCase().trim();
            // Evitar que metadatos contaminen la detección de locutor estándar
            if (!isMetadata(name)) {
                speakerFreq.set(name, (speakerFreq.get(name) || 0) + 1);
            }
        }
    });

    // We consider as "Standard Speaker" the most frequent one that starts with "LOC",
    // or just the most frequent one if none start with LOC.
    let standardSpeaker = '';
    let maxFreq = 0;
    speakerFreq.forEach((freq, name) => {
        if (name.startsWith('LOC') && freq > maxFreq) {
            maxFreq = freq;
            standardSpeaker = name;
        }
    });
    // If no LOC found, just pick the top one (que no sea metadato)
    if (!standardSpeaker && speakerFreq.size > 0) {
        speakerFreq.forEach((freq, name) => {
            if (freq > maxFreq) {
                maxFreq = freq;
                standardSpeaker = name;
            }
        });
    }

    // Second pass: Perform normalization
    const normalizedBody: ScriptItem[] = [];
    
    script.body.forEach(item => {
        if (item.type === 'sound') {
            const romanId = numberToRoman(soundCounter);
            soundCounter++;
            normalizedBody.push({ ...item, identifier: romanId });
        } else if (item.type === 'speaker') {
            const originalId = (item.identifier || '').trim();
            const rawName = (item.speakerName || 'LOCUTOR').trim();
            const cleanName = rawName.toUpperCase().replace(/[:\.\s]+$/, '');
            
            // Rule A: Metadata never gets numbered and shouldn't be treated as a speaker block
            if (isMetadata(cleanName)) {
                normalizedBody.push({
                    type: 'text',
                    text: [`${rawName}: ${item.text.join(' ')}`]
                });
                return;
            }

            // Rule B: Strict numbering policy
            const isLoc = cleanName.startsWith('LOC');
            const hadId = originalId !== '' && !isNaN(Number(originalId));
            const shouldNumber = isLoc || hadId;

            // Si es un "falso locutor" (frases como "HACEMOS UNA PAUSA", "ESCUCHEMOS", "NO OLVIDES"), 
            // lo convertimos a texto normal para evitar negritas/mayúsculas innecesarias.
            const words = cleanName.split(/\s+/);
            const suspiciousVerbs = /^(ESCUCH[AEIO]|VAYAM|SIGAM|PASAM|CONTINU|INICI|SIGUI|ENTR[AE]|SALID|FINAL|RECUERD|VIBR[AE]|REPRODUC|ESCRIB|ANUNCI|PRESENT|COMENT|LLAMAM|BENDIC)/;
            const isProbablyInstruction = !shouldNumber && (
                words.length >= 2 || 
                suspiciousVerbs.test(cleanName)
            );

            if (isProbablyInstruction && cleanName !== standardSpeaker && !isLoc) {
                 const textJoined = item.text.join(' ').trim();
                 normalizedBody.push({
                    type: 'text',
                    text: [textJoined ? `${rawName}: ${textJoined}` : `${rawName}:`]
                });
                return;
            }

            if (shouldNumber) {
                const arabicId = speakerCounter.toString().padStart(2, '0');
                speakerCounter++;
                normalizedBody.push({
                    ...item,
                    identifier: arabicId,
                    speakerName: cleanName
                });
            } else {
                // It's a character but shouldn't be numbered (e.g. DUO without original ID)
                // We keep it as speaker to have the bold/caps prefix but without the number
                normalizedBody.push({
                    ...item,
                    identifier: '',
                    speakerName: cleanName
                });
            }
        } else {
            normalizedBody.push(item);
        }
    });

    // 3. Final return
    return {
        ...script,
        body: normalizedBody
    };
}
