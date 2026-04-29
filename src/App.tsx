import React, { useState, useRef, useEffect } from 'react';
import { Download, Loader2, Mic, RotateCcw, Sparkles, FileText, Upload, Settings, Printer, Share2, ClipboardList } from 'lucide-react';
import { generateRadioScriptDocx } from './services/docxService';
import { RadioScript } from './types';
import * as mammoth from 'mammoth';
import { parseScriptLocally } from './services/localParser';
import { normalizeScriptNumbering } from './services/normalizeService';
import { EditorBlock } from './components/EditorBlock';
import { EditorToolbar } from './components/EditorToolbar';
import { InformeModal } from './components/InformeModal';

export default function App() {
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [scriptData, setScriptData] = useState<RadioScript | null>(null);
  const [originalScriptData, setOriginalScriptData] = useState<RadioScript | null>(null);
  const [savedScriptData, setSavedScriptData] = useState<RadioScript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInforme, setShowInforme] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [commentModal, setCommentModal] = useState<{ active: boolean, range: Range | null }>({ active: false, range: null });
  const previewRef = useRef<HTMLElement>(null);
  
  // Mobile UI Tab State
  const [activeTab, setActiveTab] = useState<'input' | 'preview'>('input');
  
  // Settings state
  const [fontSize, setFontSize] = useState<number>(13);
  const [lineSpacing, setLineSpacing] = useState<number>(1.15);
  const [paragraphSpacing, setParagraphSpacing] = useState<number>(6);

  const [selectionStats, setSelectionStats] = useState<{ paragraphs: number, lines: number, words: number, repetitions: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTooltip, setActiveTooltip] = useState<{ x: number, y: number, text: string } | null>(null);

  useEffect(() => {
     const previewEl = previewRef.current;
     if (!previewEl) return;

     let timeoutId: number;

     const handlePointerEvent = (e: MouseEvent | TouchEvent) => {
        const target = e.target as HTMLElement;
        const mark = target.closest('mark.comment-mark');
        if (mark) {
           const comment = mark.getAttribute('data-comment');
           if (comment) {
               const rect = mark.getBoundingClientRect();
               // We position the tooltip below the comment highlight
               setActiveTooltip({ 
                  x: rect.left + rect.width / 2, 
                  y: rect.bottom + window.scrollY, 
                  text: comment 
               });
               
               if (e.type === 'mouseover') {
                   clearTimeout(timeoutId);
                   mark.addEventListener('mouseleave', () => {
                       timeoutId = window.setTimeout(() => setActiveTooltip(null), 300);
                   }, { once: true });
               }
           }
        } else if (e.type === 'click') {
           setActiveTooltip(null);
        }
     };

     previewEl.addEventListener('click', handlePointerEvent);
     previewEl.addEventListener('mouseover', handlePointerEvent);
     
     return () => {
        previewEl.removeEventListener('click', handlePointerEvent);
        previewEl.removeEventListener('mouseover', handlePointerEvent);
     };
  }, [scriptData, activeTab]);

  const handleSave = () => {
    if (scriptData) {
      setSavedScriptData(JSON.parse(JSON.stringify(scriptData)));
      setIsDirty(false);
    }
  };

  const handleRevert = () => {
    if (savedScriptData) {
      const confirmRevert = window.confirm("¿Está seguro de que desea revertir todos los cambios no guardados?");
      if (confirmRevert) {
        setScriptData(JSON.parse(JSON.stringify(savedScriptData)));
        setIsDirty(false);
      }
    }
  };

  const requireSaveBeforeAction = (action: () => void) => {
    if (isDirty) {
      const confirmSave = window.confirm("Hay cambios sin guardar. ¿Desea guardarlos y continuar? Si cancela, los últimos cambios no se incluirán.");
      if (confirmSave) {
        handleSave();
        // Since handleSave updates state immediately in memory for scriptData, we can just proceed.
        // Wait, action may rely on originalScriptData (like informe). State updates are async.
        // But generate docx uses scriptData. Let's just proceed.
        setTimeout(action, 0); 
      }
    } else {
      action();
    }
  };

  const processScriptText = async (textToProcess: string) => {
    if (!textToProcess.trim()) return;
    setIsProcessing(true);
    setError(null);

    try {
      // Intentar el parsing local
      const localParsedData = parseScriptLocally(textToProcess);
      
      if (localParsedData) {
          const normalized = normalizeScriptNumbering(localParsedData);
          setScriptData(normalized);
          setOriginalScriptData(JSON.parse(JSON.stringify(normalized)));
          setSavedScriptData(JSON.parse(JSON.stringify(normalized)));
          // Auto-scroll on generated
          if (window.innerWidth < 768) {
             setActiveTab('preview');
          }
          setTimeout(() => {
             previewRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 300);
      } else {
          throw new Error("No se pudo extraer el contenido. Revise el archivo.");
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
    setOriginalScriptData(null);
    setSavedScriptData(null);
    setIsDirty(false);
    setError(null);
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);

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
            throw new Error("El archivo no convirtiera texto legible.");
        }
            
        setInputText(text);
        
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    } catch (err) {
        console.error("Error reading docx:", err);
        setError("Error al leer el archivo. Asegúrese de que sea un archivo .docx válido.");
    }
  };

  const getFileName = (script: RadioScript | null) => {
    if (!script) return 'GUION_FORMATEADO.DOCX';
    
    // Strip HTML from values in case they were edited using content editable
    const stripHtml = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

    const progCredit = script.credits.find(c => c.label.toUpperCase().includes('PROGRAMA'));
    const programa = stripHtml(progCredit?.value || '');
    
    // Find a FECHA credit that actually has a value
    const fechaMatches = script.credits.filter(c => c.label.toUpperCase().includes('FECHA'));
    const fechaCredit = fechaMatches.find(c => {
        const val = stripHtml(c.value);
        return val && !val.includes('____');
    }) || fechaMatches[0];
    
    const fechaRaw = stripHtml(fechaCredit?.value || '');
    
    let fileName = 'GUION';
    if (programa && !programa.includes('____')) {
      fileName = programa.toUpperCase();
    }

    if (fechaRaw && !fechaRaw.includes('____')) {
        const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
        const fullMonths = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

        let day = '';
        let month = '';
        let year = '';

        // Buscar números de 1 o 2 dígitos para el día
        const numbers = fechaRaw.match(/\d+/g);
        if (numbers) {
            if (numbers[0]) day = numbers[0];
            // Si hay un segundo número que parece año (4 dígitos)
            const possibleYear = numbers.find(n => n.length === 4);
            if (possibleYear) year = possibleYear;
        }

        const upperFecha = fechaRaw.toUpperCase();
        for (let i = 0; i < fullMonths.length; i++) {
            if (upperFecha.includes(fullMonths[i])) {
                month = months[i];
                break;
            }
        }

        if (day && month && year) {
            fileName += ` ${day} ${month} ${year}`;
        } else if (day && month) {
             fileName += ` ${day} ${month}`;
        } else {
            // Fallback: limpiar un poco el string original (quitar "DE", "DEL", "/", "-")
            const cleaned = fechaRaw.toUpperCase()
                .replace(/\bDE\b/g, '')
                .replace(/\bDEL\b/g, '')
                .replace(/[\\/-]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
            fileName += ` ${cleaned}`;
        }
    }
    
    return `${fileName.replace(/\s+/g, ' ').trim()}.DOCX`;
  };

  const handleDownload = async () => {
    if (!scriptData) return;
    
    try {
      const blob = await generateRadioScriptDocx(scriptData, { fontSize, lineSpacing, paragraphSpacing });
      const url = URL.createObjectURL(blob);
      
      const fileName = getFileName(scriptData);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Error creating docx:", err);
      setError("Error al crear el archivo Word.");
    }
  };

  const handleSelection = () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (!selectedText || selectedText.length === 0) {
      setSelectionStats(null);
      return;
    }

    // Calcular stats de la selección
    const paragraphs = selectedText.split(/\n+/).filter(p => p.trim().length > 0).length;
    const wordsArr = selectedText.split(/\s+/).filter(w => w.length > 0);
    const words = wordsArr.length;
    // Estimación de líneas basada en saltos de línea + envoltura básica (asumimos ~80 caracteres por línea)
    const lineBreaks = selectedText.split('\n').length;
    const lines = Math.max(lineBreaks, Math.ceil(selectedText.length / 80));

    // Calcular repeticiones del texto seleccionado en todo el guion (texto de entrada o procesado)
    let repetitions = 0;
    if (scriptData) {
        const fullText = scriptData.body.map(item => item.text.join(' ')).join(' ');
        // Escapar caracteres especiales para regex
        const escapedSelection = selectedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedSelection, 'gi');
        const matches = fullText.match(regex);
        repetitions = matches ? matches.length : 0;
    }

    setSelectionStats({ paragraphs, lines, words, repetitions });
  };

  const handleAddComment = () => {
     const selection = window.getSelection();
     if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
     
     setCommentModal({ active: true, range: selection.getRangeAt(0).cloneRange() });
  };

  const handleConfirmComment = (text: string) => {
     if (commentModal.range && text.trim()) {
         const selection = window.getSelection();
         selection?.removeAllRanges();
         selection?.addRange(commentModal.range);

         try {
             // using execCommand over surroundContents so it safely handles mixed nodes across blocks (to some extent)
             // But actually, just applying a background via execCommand or using standard wrapping
             const selectedText = commentModal.range.toString();
             const frag = commentModal.range.cloneContents();
             const div = document.createElement('div');
             div.appendChild(frag);
             const inner = div.innerHTML;

             const safeText = text.replace(/"/g, '&quot;');
             document.execCommand('insertHTML', false, `<mark class="bg-yellow-200 cursor-help comment-mark rounded px-1" data-comment="${safeText}">${inner}</mark>`);
         } catch (e) {
             console.warn("No se pudo envolver la selección", e);
         }
         setIsDirty(true);
     }
     setCommentModal({ active: false, range: null });
  };

  const updateScriptBodyText = (itemIndex: number, textIndex: number, newHtml: string) => {
     setScriptData(prev => {
        if (!prev) return prev;
        const newBody = [...prev.body];
        const newTextList = [...newBody[itemIndex].text];
        newTextList[textIndex] = newHtml;
        newBody[itemIndex] = { ...newBody[itemIndex], text: newTextList };
        return { ...prev, body: newBody };
     });
     setIsDirty(true);
  };

  const updateSpeakerProps = (itemIndex: number, newHtml: string, type: 'name' | 'intention') => {
     setScriptData(prev => {
        if (!prev) return prev;
        const newBody = [...prev.body];
        const cleanContent = newHtml.replace(/<[^>]+>/g, '').trim(); // strip html for core identifying fields
        
        if (type === 'name') {
           // We expect something like "01 LOCUTOR:"
           const match = cleanContent.match(/^(?:(\d+)\s+)?([^:]+):?$/i);
           const id = match && match[1] ? match[1] : '';
           const name = match && match[2] ? match[2] : cleanContent.replace(':', '');
           
           newBody[itemIndex] = { ...newBody[itemIndex], identifier: id, speakerName: name };
        } else if (type === 'intention') {
           const intention = cleanContent.replace(/^\(/, '').replace(/\)$/, '');
           newBody[itemIndex] = { ...newBody[itemIndex], intention };
        }
        
        return { ...prev, body: newBody };
     });
     setIsDirty(true);
  };

  const updateCredit = (index: number, newHtml: string) => {
    setScriptData(prev => {
        if (!prev) return prev;
        const newCredits = [...prev.credits];
        newCredits[index] = { ...newCredits[index], value: newHtml };
        return { ...prev, credits: newCredits };
    });
    setIsDirty(true);
  };

  return (
    <div className="bg-slate-100 flex flex-col h-screen overflow-hidden text-slate-800 font-sans">
      
      {/* Header Navigation */}
      <header className="bg-white border-b border-slate-300 px-4 sm:px-6 py-3 flex flex-col items-center sm:items-stretch shadow-sm shrink-0 z-20 gap-3">
        <div className="flex flex-col sm:flex-row justify-between w-full items-center gap-3">
          <div className="flex items-center space-x-2 sm:space-x-3 w-full sm:w-auto justify-center sm:justify-start shrink-0">
            <div className="bg-indigo-600 p-1.5 sm:p-2 rounded-lg shrink-0">
              <Mic className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <h1 className="text-sm sm:text-lg font-bold tracking-tight text-slate-900 uppercase text-center sm:text-left shrink-0">GuionFormat</h1>
          </div>
          <div className="flex items-center w-full justify-center sm:justify-end gap-3 flex-wrap sm:flex-nowrap">
            {scriptData && (
              <>
                <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded border border-slate-200">
                    Documento: <span className="font-bold text-slate-700">{getFileName(scriptData)}</span>
                </span>
                
                <div className="flex gap-2">
                    <button 
                      onClick={() => requireSaveBeforeAction(handleDownload)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded font-bold text-[10px] sm:text-xs flex items-center justify-center shadow-sm transition-colors"
                      title="Descargar DOCX"
                    >
                      <Download className="w-3 h-3 sm:mr-1 shrink-0" />
                      <span className="hidden sm:inline">DESCARGAR</span>
                    </button>
                    <button 
                      onClick={() => requireSaveBeforeAction(() => window.print())}
                      className="bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded font-bold text-[10px] sm:text-xs flex items-center justify-center shadow-sm transition-colors"
                      title="Imprimir"
                    >
                      <Printer className="w-3 h-3 sm:mr-1 shrink-0" />
                      <span className="hidden sm:inline">IMPRIMIR</span>
                    </button>
                    <button 
                      onClick={() => requireSaveBeforeAction(() => window.open(`https://wa.me/?text=${encodeURIComponent('Revisa el guion generado en la plataforma de GuionFormat.')}`, '_blank'))}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded font-bold text-[10px] sm:text-xs flex items-center justify-center shadow-sm transition-colors"
                      title="Compartir por WhatsApp"
                    >
                      <Share2 className="w-3 h-3 sm:mr-1 shrink-0" />
                      <span className="hidden sm:inline">COMPARTIR</span>
                    </button>
                    <button 
                      onClick={() => requireSaveBeforeAction(() => setShowInforme(true))}
                      className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded font-bold text-[10px] sm:text-xs flex items-center justify-center shadow-sm transition-colors"
                      title="Ver Informe de Cambios"
                    >
                      <ClipboardList className="w-3 h-3 sm:mr-1 shrink-0" />
                      <span className="hidden sm:inline">INFORME</span>
                    </button>
                </div>
              </>
            )}
          </div>
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
                      accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
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
                      CARGAR .DOCX
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
        <section 
           ref={previewRef}
           style={{ WebkitOverflowScrolling: 'touch' }}
           className={`flex-1 bg-white flex-col relative ${activeTab === 'preview' ? 'flex' : 'hidden md:flex'}`}
        >
          {scriptData && (
             <EditorToolbar 
                onAddComment={handleAddComment} 
                onSave={handleSave} 
                onRevert={handleRevert} 
                isDirty={isDirty} 
             />
          )}

          <div 
            className="flex-1 py-12 px-8 overflow-y-auto flex flex-col items-center bg-white relative pb-32"
            onMouseUp={handleSelection}
            onKeyUp={handleSelection}
          >
            {/* The "Paper" - Carta (Letter) Size: 21.59cm x 27.94cm */}
            <div 
              className="w-full max-w-[21.59cm] min-h-[27.94cm] h-auto flex flex-col bg-white relative mb-12 pb-16" 
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
                  <div className="mb-8 space-y-2">
                    {scriptData.credits.map((c, i) => (
                      <div key={i} className="leading-snug">
                        <span className="font-bold uppercase">{c.label}: </span>
                        <EditorBlock 
                            html={c.value}
                            onChange={(html) => updateCredit(i, html)}
                            className="inline"
                        />
                      </div>
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
                                 {idx === 0 && (
                                     <span className="font-bold uppercase">
                                       <EditorBlock 
                                          html={`${item.identifier} SON:`}
                                          onChange={(html) => updateSpeakerProps(i, html, 'name')}
                                          className="inline"
                                       /> 
                                     </span>
                                 )}
                                 <EditorBlock 
                                    html={cleanText}
                                    onChange={(html) => updateScriptBodyText(i, idx, html)}
                                    className="font-bold uppercase underline underline-offset-2 inline" 
                                 />
                               </div>
                             );
                         });
                      } else if (item.type === 'speaker') {
                         const paragraphs = item.text || [];
                         return paragraphs.map((p, idx) => (
                             <div key={`${i}-${idx}`} style={{ paddingLeft: '2cm', textIndent: idx === 0 ? '-2cm' : '0' }}>
                               {idx === 0 && (
                                   <>
                                     <span className="font-bold uppercase">
                                       <EditorBlock 
                                          html={`${item.identifier ? `${item.identifier} ` : ''}${item.speakerName || 'LOCUTOR'}:`}
                                          onChange={(html) => updateSpeakerProps(i, html, 'name')}
                                          className="inline"
                                       />
                                     </span>
                                     {item.intention && <span className="font-bold uppercase"> 
                                        <EditorBlock 
                                           html={`(${item.intention})`}
                                           onChange={(html) => updateSpeakerProps(i, html, 'intention')} 
                                           className="inline"
                                        />
                                     </span>}
                                     <span> </span>
                                   </>
                               )}
                               <EditorBlock 
                                   html={p}
                                   onChange={(html) => updateScriptBodyText(i, idx, html)}
                                   className="inline" 
                               />
                             </div>
                         ));
                      } else if (item.type === 'text') {
                        const paragraphs = item.text || [];
                        return paragraphs.map((p, idx) => (
                            <div key={`${i}-${idx}`} className="text-slate-700" style={{ paddingLeft: '2cm' }}>
                              <EditorBlock 
                                   html={p}
                                   onChange={(html) => updateScriptBodyText(i, idx, html)}
                                   className="inline" 
                               />
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
      <footer className="bg-slate-900 border-t border-slate-700 text-slate-200 py-2.5 px-4 sm:px-6 flex justify-between items-center text-[10px] sm:text-[11px] font-mono shrink-0 z-20">
        <div className="flex space-x-6 overflow-x-auto whitespace-nowrap hide-scrollbar flex-1">
          {selectionStats ? (
            <div className="flex space-x-6 text-indigo-300 font-bold items-center">
               <span className="text-white bg-indigo-600 px-1.5 py-0.5 rounded text-[9px]">SELECCIÓN</span>
               <span>{selectionStats.paragraphs} PÁRRAFOS</span>
               <span>{selectionStats.lines} LÍNEAS</span>
               <span>{selectionStats.words} PALABRAS</span>
               {selectionStats.words > 0 && selectionStats.words < 10 && (
                   <span className="bg-slate-800 px-2 py-0.5 rounded text-white border border-slate-700">REPETICIONES: {selectionStats.repetitions} VECES</span>
               )}
            </div>
          ) : (
            <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                <span className="italic text-slate-500">Seleccione texto en la vista previa para ver estadísticas de locución...</span>
            </div>
          )}
        </div>
      </footer>
      {showInforme && (
        <InformeModal 
           original={originalScriptData} 
           current={scriptData} 
           onClose={() => setShowInforme(false)} 
        />
      )}

      {/* Editor Comment Modals & Tooltips */}
      {commentModal.active && (
         <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-4 animate-in fade-in zoom-in-95 duration-200">
              <h3 className="text-sm font-bold text-slate-800 mb-2">Insertar Comentario</h3>
              <textarea 
                 autoFocus
                 className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none min-h-[100px]"
                 placeholder="Escriba su comentario aquí..."
                 onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleConfirmComment(e.currentTarget.value);
                    }
                 }}
              />
              <div className="flex justify-end space-x-2 mt-3">
                 <button 
                    onClick={() => setCommentModal({ active: false, range: null })}
                    className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded"
                 >
                    CANCELAR
                 </button>
                 <button 
                    onClick={(e) => {
                        const textarea = e.currentTarget.parentElement?.parentElement?.querySelector('textarea');
                        if (textarea) handleConfirmComment(textarea.value);
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded shadow-sm"
                 >
                    COMENTAR
                 </button>
              </div>
           </div>
         </div>
      )}

      {activeTooltip && (
          <div 
            className="fixed z-50 animate-in fade-in slide-in-from-bottom-2 px-3 py-2 text-xs font-medium text-white bg-slate-800 rounded shadow-lg max-w-xs break-words pointer-events-none"
            style={{ 
               left: Math.max(10, Math.min(window.innerWidth - 10, activeTooltip.x)), 
               top: activeTooltip.y + 8,
               transform: 'translate(-50%, 0)'
            }}
          >
            {activeTooltip.text}
            <div className="absolute top-0 left-1/2 -mt-1 w-2 h-2 bg-slate-800 rotate-45 -translate-x-1/2"></div>
          </div>
      )}
    </div>
  );
}
