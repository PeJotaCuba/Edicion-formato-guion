const p = "(7) LOC Arte Bayamo está dedicado hoy a la vida";
const noColonMatch = p.match(/^[\(]?(\d+)[\)]?[\s.-]*([A-ZÁÉÍÓÚÑa-záéíóúñ]{2,15})\b\s*(?:\(([^)]+)\))?\s*(.*)$/i);
console.log("noColonMatch", noColonMatch);
