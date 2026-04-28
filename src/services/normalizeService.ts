import { RadioScript } from './geminiService';

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

    // 1. Normalize Body Items
    const normalizedBody = script.body.map(item => {
        if (item.type === 'sound') {
            const romanId = numberToRoman(soundCounter);
            soundCounter++;
            return {
                ...item,
                identifier: romanId
            };
        } else if (item.type === 'speaker') {
            const arabicId = speakerCounter.toString().padStart(2, '0');
            speakerCounter++;
            let cleanName = (item.speakerName || 'LOCUTOR').toUpperCase().replace(/[:\.\s]+$/, '');
            return {
                ...item,
                identifier: arabicId,
                speakerName: cleanName
            };
        }
        return item;
    });

    // 2. Normalize Credits (Frontis)
    const exactFrontisTemplate = [
        'EMISORA',
        'PROGRAMA',
        'FECHA',
        'TEMA',
        'ESCRITOR (A)',
        'ASESOR (A)',
        'DIRECTOR (A)',
        'REALIZADOR DE SONIDOS (A)',
        'LOCUTOR (A)'
    ];

    const currentCreditsMap = new Map<string, string>();
    
    // Map existing credits
    script.credits.forEach(c => {
        let label = c.label.toUpperCase().replace(/\s+DE TRANSMISIÓN/i, ''); // normalize 'FECHA DE TRANSMISIÓN' back to 'FECHA' just in case
        if (label === 'REALIZADOR DE SONIDO' || label === 'REALIZADOR') label = 'REALIZADOR DE SONIDOS (A)';
        else if (label === 'ESCRIBE' || label === 'ESCRITOR' || label === 'GUIÓN') label = 'ESCRITOR (A)';
        else if (label === 'ASESOR' || label === 'ASESORÍA') label = 'ASESOR (A)';
        else if (label === 'DIRECTOR' || label === 'DIRIGE') label = 'DIRECTOR (A)';
        else if (label === 'LOCUTOR' || label === 'LOCUTORES') label = 'LOCUTOR (A)';
        else if (label === 'FECHA DE TRANSMISIÓN' || label === 'FECHA DE EMISIÓN') label = 'FECHA';
        
        currentCreditsMap.set(label, c.value);
    });

    const normalizedCredits = exactFrontisTemplate.map(label => {
        let val = currentCreditsMap.get(label) || '_________________________';

        // Enforce Emisora Name
        if (label === 'EMISORA') {
            const upVal = val.toUpperCase();
            if (upVal.includes('RADIO CIUDAD MONUMENTO') && !upVal.includes('CMNL')) {
                val = 'CMNL RADIO CIUDAD MONUMENTO';
            } else if (!val || val === '_________________________' || val.trim() === '') {
                val = 'CMNL RADIO CIUDAD MONUMENTO';
            } else if (upVal === 'RADIO CIUDAD MONUMENTO') {
                val = 'CMNL RADIO CIUDAD MONUMENTO';
            }
        }

        return { label, value: val };
    });

    return {
        credits: normalizedCredits,
        body: normalizedBody
    };
}
