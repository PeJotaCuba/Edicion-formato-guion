import React, { useState, useRef } from 'react';
import { Download, Loader2, Mic, RotateCcw, Sparkles, FileText, Upload, Settings } from 'lucide-react';
import { generateRadioScriptJson, RadioScript } from './services/geminiService';
import { generateRadioScriptDocx } from './services/docxService';
import * as mammoth from 'mammoth';
import { parseScriptLocally } from './services/localParser';
import { normalizeScriptNumbering } from './services/normalizeService';

import { extractDoc } from './services/docExtractor';

export default function App() {
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [scriptData, setScriptData] = useState<RadioScript | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Mobile UI Tab State
  const [activeTab, setActiveTab] = useState<'input' | 'preview'>('input');
  
  // Settings state
  const [fontSize, setFontSize] = useState<number>(13);
  const [lineSpacing, setLineSpacing] = useState<number>(1.15);
  const [paragraphSpacing, setParagraphSpacing] = useState<number>(6);

  // Conversion flow states
  const [showDocPrompt, setShowDocPrompt] = useState(false);
  const [isConvertingDoc, setIsConvertingDoc] = useState(false);
  const [docConversionSuccess, setDocConversionSuccess] = useState(false);
  const [pendingDocFile, setPendingDocFile] = useState<File | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const processScriptText = async (textToProcess: string) => {
    if (!textToProcess.trim()) return;
    setIsProcessing(true);
    setError(null);

    try {
      // 1. Intentar el parsing local primero
      const localParsedData = parseScriptLocally(textToProcess);
      
      if (localParsedData) {
          setScriptData(normalizeScriptNumbering(localParsedData));
      } else {
          // 2. IA parsing
          const data = await generateRadioScriptJson(textToProcess);
          setScriptData(normalizeScriptNumbering(data));
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Ocurrió un error al generar el guion.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerate = async () => {
    await processScriptText(inputText);
  };

  const handleClear = () => {
    setInputText('');
    setScriptData(null);
    setError(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

    const isLegacyDoc = file.name.toLowerCase().endsWith('.doc') || file.type === 'application/msword';
    
    if (isLegacyDoc) {
      setPendingDocFile(file);
      setShowDocPrompt(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Proceso normal para .docx
    try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        
        const text = result.value
            .replace(/<\/(p|h[1-6]|div|li|tr)>/gi, '\n')
            .replace(/<br\s*[\/]?>/gi, '\n')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/ {2,}/g, ' ')
            .replace(/\n\s*\n/g, '\n')
            .trim();
            
        if (text.length < 20) {
            throw new Error("El archivo no contenía texto legible o está dañado.");
        }
            
        setInputText(text);
        
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    } catch (err) {
        console.error("Error reading docx:", err);
        setError("Error al leer el archivo. Asegúrese de que sea un archivo .docx de Word válido y no esté corrupto.");
    }
  };

  const executeDocConversion = async () => {
    if (!pendingDocFile) return;
    
    setIsConvertingDoc(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", pendingDocFile);

      const response = await fetch("/api/extract-doc", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        let errorMsg = "Error en la conversión del documento server-side";
        try {
           const errData = await response.json();
           if (errData.error) errorMsg = errData.error;
        } catch(e) {}
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const text = data.text;
      
      let cleanedText = text
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/\n\s*\n/g, '\n')
            .trim();

      if (cleanedText.length < 20) {
        throw new Error("El archivo no contenía texto legible o está dañado.");
      }

      setInputText(cleanedText);
      setIsConvertingDoc(false);
      setDocConversionSuccess(true);
      setPendingDocFile(null);
      
      setTimeout(() => {
         setDocConversionSuccess(false);
         setShowDocPrompt(false);
         processScriptText(cleanedText);
      }, 2500);

    } catch (err: any) {
      console.error("Error convirtiendo doc:", err);
      setError(`Fallo al convertir internamente el .doc: ${err.message}`);
      setIsConvertingDoc(false);
      setShowDocPrompt(false);
      setPendingDocFile(null);
    }
  };

  const abortDocConversion = () => {
    setShowDocPrompt(false);
    setPendingDocFile(null);
  };

  const handleDownload = async () => {
    if (!scriptData) return;
    
    try {
      const blob = await generateRadioScriptDocx(scriptData, { fontSize, lineSpacing, paragraphSpacing });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'Guion_Formateado.docx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Error creating docx:", err);
      setError("Error al crear el archivo Word.");
    }
  };

  const technicalLinesCount = scriptData?.body.filter(i => i.type === 'sound').length || 0;
  const interventionsCount = scriptData?.body.filter(i => i.type === 'speaker').length || 0;

  return (
    <div className="bg-slate-100 flex flex-col h-screen overflow-hidden text-slate-800 font-sans">
      
      {/* Doc Conversion Modal */}
      {showDocPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-sm w-full p-6 text-center transform transition-all">
            {!docConversionSuccess ? (
               <>
                 <div className="flex justify-center mb-4">
                   {isConvertingDoc ? (
                     <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                   ) : (
                     <FileText className="w-12 h-12 text-orange-500" />
                   )}
                 </div>
                 <h2 className="text-lg font-bold text-slate-800 mb-2 uppercase">
                   {isConvertingDoc ? 'Convirtiendo...' : 'Archivo antiguo detectado'}
                 </h2>
                 <p className="text-sm text-slate-600 mb-6">
                   {isConvertingDoc 
                     ? 'Por favor, espere mientras procesamos y extraemos el contenido del documento .doc internamente.'
                     : 'Se ha cargado un archivo formato .doc (Word antiguo). Es necesario convertirlo internamente para poder procesarlo correctamente.'}
                 </p>
                 {!isConvertingDoc && (
                   <div className="flex justify-center space-x-3">
                     <button 
                       onClick={abortDocConversion}
                       className="px-4 py-2 border border-slate-300 rounded font-bold text-xs text-slate-600 hover:bg-slate-50 transition-colors uppercase"
                     >
                       Cancelar
                     </button>
                     <button 
                       onClick={executeDocConversion}
                       className="px-4 py-2 bg-indigo-600 rounded font-bold text-xs text-white hover:bg-indigo-700 shadow-md transition-colors uppercase"
                     >
                       Convertir
                     </button>
                   </div>
                 )}
               </>
            ) : (
               <>
                 <div className="flex justify-center mb-4">
                   <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                     <Sparkles className="w-6 h-6 text-green-600" />
                   </div>
                 </div>
                 <h2 className="text-lg font-bold text-slate-800 mb-2 uppercase">¡Conversión Exitosa!</h2>
                 <p className="text-sm text-slate-600">El guion está listo para ser procesado.</p>
               </>
            )}
          </div>
        </div>
      )}

      {/* Header Navigation */}
      <header className="bg-white border-b border-slate-300 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row justify-between items-center shadow-sm shrink-0 z-20 gap-3 sm:gap-0">
        <div className="flex items-center space-x-2 sm:space-x-3 w-full sm:w-auto justify-center sm:justify-start">
          <div className="bg-indigo-600 p-1.5 sm:p-2 rounded-lg shrink-0">
            <Mic className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <h1 className="text-sm sm:text-xl font-bold tracking-tight text-slate-900 uppercase text-center sm:text-left">GuionFormat</h1>
        </div>
        <div className="flex items-center space-x-4 w-full sm:w-auto justify-center sm:justify-end">
          {scriptData && (
            <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-widest hidden md:inline-block">Documento: Guion_Formateado.docx</span>
          )}
          <button 
            onClick={handleDownload}
            disabled={!scriptData}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white w-full sm:w-auto px-4 sm:px-5 py-2 rounded font-bold text-xs sm:text-sm flex items-center justify-center shadow-md transition-colors"
          >
            <Download className="w-4 h-4 mr-2 shrink-0" />
            <span>DESCARGAR</span><span className="hidden sm:inline">&nbsp;.DOCX</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* Mobile Tabs */}
        <div className="md:hidden flex bg-slate-200 p-2 shrink-0 space-x-2">
          <button 
            className={`flex-1 py-2 text-[10px] font-bold uppercase rounded shadow-sm ${activeTab === 'input' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500'}`}
            onClick={() => setActiveTab('input')}
          >
            Entrar Datos
          </button>
          <button 
             className={`flex-1 py-2 text-[10px] font-bold uppercase rounded shadow-sm ${activeTab === 'preview' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500'}`}
             onClick={() => setActiveTab('preview')}
          >
             Vista Previa
          </button>
        </div>

        {/* Input Area */}
        <section className={`w-full md:w-1/3 md:min-w-[320px] md:max-w-[500px] border-b md:border-b-0 md:border-r border-slate-300 bg-slate-50 flex-col z-10 overflow-y-auto ${activeTab === 'input' ? 'flex' : 'hidden md:flex'}`}>
          <div className="p-4 border-b border-slate-200 bg-slate-100 flex justify-between items-center shrink-0">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Entrada & Configuración</span>
            <button 
              onClick={handleClear}
              className="text-indigo-600 text-xs font-bold hover:underline flex items-center"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              LIMPIAR
            </button>
          </div>
          <div className="flex-1 p-4 flex flex-col gap-4">
            
            {/* Action Bar: File Upload */}
            <div className="flex items-center justify-between">
                <div>
                   <input 
                     type="file" 
                     accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
                     ref={fileInputRef}
                     onChange={handleFileUpload} 
                     className="hidden" 
                     id="docx-upload"
                   />
                   <label 
                     htmlFor="docx-upload" 
                     className="cursor-pointer bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center shadow-sm transition-colors"
                   >
                     <Upload className="w-4 h-4 mr-2" />
                     CARGAR DOCX / DOC
                   </label>
                </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs font-medium">
                {error}
              </div>
            )}
            <textarea 
              className="flex-1 min-h-[200px] w-full bg-white border border-slate-300 rounded p-4 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none shadow-inner" 
              placeholder="Pegue aquí el texto original o cargue un archivo .docx..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isProcessing}
            />

            {/* Formatting Settings */}
            <div className="bg-white p-4 border border-slate-200 rounded shadow-sm space-y-4">
                <div className="flex items-center space-x-2 text-slate-700 mb-2">
                    <Settings className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">AJUSTES DEL GUION FINAL</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tamaño Letra</label>
                        <select 
                            value={fontSize} 
                            onChange={(e) => setFontSize(Number(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                            <option value={12}>12 pt</option>
                            <option value={13}>13 pt</option>
                            <option value={14}>14 pt</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Interlineado</label>
                        <select 
                            value={lineSpacing} 
                            onChange={(e) => setLineSpacing(Number(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                            <option value={1}>Sencillo (1.0)</option>
                            <option value={1.15}>Múltiple (1.15)</option>
                            <option value={1.5}>1.5 líneas</option>
                        </select>
                    </div>
                    <div className="space-y-1 col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Espacio entre Párrafos</label>
                        <select 
                            value={paragraphSpacing} 
                            onChange={(e) => setParagraphSpacing(Number(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                            <option value={3}>3 pt</option>
                            <option value={6}>6 pt</option>
                            <option value={10}>10 pt</option>
                        </select>
                    </div>
                </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isProcessing || !inputText.trim()}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white px-4 py-3 rounded font-bold text-sm flex items-center justify-center shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  PROCESANDO...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  GENERAR FORMATO
                </>
              )}
            </button>
          </div>
        </section>

        {/* Preview Area */}
        <section className={`flex-1 bg-white flex-col relative ${activeTab === 'preview' ? 'flex' : 'hidden md:flex'}`}>
          <div className="absolute top-4 right-6 p-2 z-10">
            <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-1 rounded border border-indigo-200 shadow-sm">
               {scriptData ? `VISTA PREVIA DE FORMATO ARIAL ${fontSize}PT` : 'VISTA PREVIA'}
            </span>
          </div>
          
          <div className="flex-1 py-12 px-8 overflow-y-auto shadow-inner flex justify-center bg-slate-200">
            {/* The "Paper" */}
            <div 
              className="w-full max-w-[21cm] h-fit min-h-[29.7cm] bg-white shadow-2xl relative" 
            >
              {scriptData ? (
                <div 
                    className="p-8 sm:p-[1.27cm]"
                    style={{ 
                        fontFamily: 'Arial, sans-serif',
                        fontSize: `${fontSize}pt`,
                        lineHeight: lineSpacing
                    }}
                >
                  {/* Page number on preview */}
                  <div className="absolute top-[1.27cm] right-[1.27cm] font-bold font-arial text-[12pt]">1</div>

                  {/* Header Block */}
                  <div className="mb-8 space-y-0">
                    {scriptData.credits.map((c, i) => (
                      <p key={i}>
                        <span className="font-bold uppercase">{c.label}:</span> {c.value}
                      </p>
                    ))}
                  </div>

                  {/* Script Content */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: `${paragraphSpacing}pt` }}>
                    {scriptData.body.map((item, i) => {
                      if (item.type === 'sound') {
                         const paragraphs = item.text || [];
                         return paragraphs.map((p, idx) => {
                             const cleanText = idx === 0 ? p.replace(/^(?:SON|OP)\s*:?\s*/i, '').trim() : p;
                             return (
                               <div key={`${i}-${idx}`} style={{ paddingLeft: '2cm', textIndent: idx === 0 ? '-2cm' : '0' }}>
                                 {idx === 0 && <span className="font-bold uppercase">{item.identifier} SON </span>}
                                 <span className="font-bold uppercase underline underline-offset-2">{cleanText}</span>
                               </div>
                             );
                         });
                      } else {
                         const paragraphs = item.text || [];
                         return paragraphs.map((p, idx) => (
                             <div key={`${i}-${idx}`} style={{ paddingLeft: '2cm', textIndent: idx === 0 ? '-2cm' : '0' }}>
                               {idx === 0 && (
                                   <>
                                     <span className="font-bold uppercase">{item.identifier} {item.speakerName || 'LOCUTOR'}:</span>
                                     {item.intention && <span className="font-bold uppercase"> ({item.intention})</span>}
                                     <span> </span>
                                   </>
                               )}
                               <span>{p}</span>
                             </div>
                         ));
                      }
                    })}
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 space-y-4 py-32">
                   <FileText className="w-16 h-16 opacity-50" />
                   <p className="font-mono text-sm uppercase tracking-widest text-center">
                     El guion formateado aparecerá aquí.<br/>
                     Ingrese texto y presione generar.
                   </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Footer Status Bar */}
      <footer className="bg-slate-900 text-slate-400 py-2 px-4 sm:px-6 flex justify-between items-center text-[10px] sm:text-[11px] font-mono shrink-0 z-20">
        <div className="flex space-x-4 sm:space-x-6 overflow-x-auto whitespace-nowrap hide-scrollbar">
          <span className="flex items-center"><span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>SISTEMA ACTIVO</span>
          <span>CARACTERES: {inputText.length}</span>
          <span>LÍNEAS TÉCNICAS: {technicalLinesCount}</span>
          <span>INTERVENCIONES: {interventionsCount}</span>
        </div>
        <div className="hidden sm:block">
          LICENCIA PROFESIONAL: #RAD-992-00
        </div>
      </footer>
    </div>
  );
}
