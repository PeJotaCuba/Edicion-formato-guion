export interface ScriptItem {
    type: "speaker" | "sound" | "text";
    identifier?: string; // "01", "02" or "I", "II"
    speakerName?: string; // "LOCUTOR" 
    intention?: string; // "ALEGRE", etc.
    text: string[];
}

export interface RadioScript {
  credits: {
    label: string;
    value: string;
  }[];
  body: ScriptItem[];
}
