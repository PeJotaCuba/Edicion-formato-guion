import React, { useState, useRef, useEffect } from 'react';
import { Download, Loader2, Mic, RotateCcw, Sparkles, FileText, Upload, Settings, Printer, Share2, ClipboardList, Trash2, CheckCircle2 } from 'lucide-react';
import { generateDocxFromHtml } from './services/docxService';
import { RadioScript } from './types';
import * as mammoth from 'mammoth';
import { parseScriptLocally } from './services/localParser';
import { normalizeScriptNumbering } from './services/normalizeService';
import { EditorBlock } from './components/EditorBlock';
import { EditorToolbar } from './components/EditorToolbar';
import { InformeModal } from './components/InformeModal';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface DocumentItem {
  id: string;
  originalFileName: string;
  inputText: string;
  scriptData: RadioScript | null;
  originalScriptData: RadioScript | null;
  editorHtml: string;
  externalVersion: number;
  history: string[];
  isDirty: boolean;
}

function replaceMarkdownBold(text: string): string {
    if (!text) return '';
    let res = text.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    res = res.replace(/\*([^*]+)\*/g, '<b>$1</b>');
    res = res.replace(/\*/g, '');
    return res;
}

function scriptDataToHtml(script: RadioScript, formatMode: 'all' | 'numbering' | 'credits' = 'all'): string {
   let html = '<div id="script-credits" style="margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #f1f5f9;">';
   
   if (formatMode === 'all' || formatMode === 'credits') {
       script.credits.forEach(c => {
          let creditLabel = c.label;
          const val = replaceMarkdownBold(c.value);
          if (val && !val.includes('____')) {
             html += `<div style="line-height: normal;"><b>${creditLabel}: </b>${val}</div>`;
          } else {
             html += `<div style="line-height: normal;"><b>${creditLabel}: </b></div>`;
          }
       });
   } else {
       (script.rawCredits || []).forEach(c => {
          html += `<div>${c.label ? c.label + ': ' : ''}${c.value}</div>`;
       });
   }
   
   html += '</div><div id="script-body">';

   if (formatMode === 'credits') {
       // Si solo se quieren los créditos con formato, el resto del guion queda intacto sin márgenes ni números adicionales.
       script.body.forEach(item => {
          const paragraphs = item.text || [];
          paragraphs.forEach((p, idx) => {
              const val = replaceMarkdownBold(p);
              
              if (idx === 0) {
                 if (item.type === 'speaker') {
                     const prefixId = item.identifier ? `${item.identifier} ` : '';
                     html += `<div>${prefixId}${item.speakerName || 'LOCUTOR'}: ${item.intention ? `(${item.intention}) ` : ''}${val}</div>`;
                 } else if (item.type === 'sound') {
                     const prefixId = item.identifier ? `${item.identifier} ` : '';
                     html += `<div>${prefixId}SON: ${val}</div>`;
                 } else {
                     html += `<div>${val}</div>`;
                 }
              } else {
                  html += `<div>${val}</div>`;
              }
          });
       });
   } else {
       script.body.forEach(item => {
          if (item.type === 'speaker') {
             const paragraphs = item.text || [];
             paragraphs.forEach((p, idx) => {
                const isFirst = idx === 0;
                const indentStyle = isFirst ? '-2cm' : '0';
                let bHtml = `<div style="margin-left: 2cm; text-indent: ${indentStyle};">`;
                if (isFirst) {
                    const prefixId = item.identifier ? `${item.identifier} ` : '';
                    bHtml += `<b>${prefixId}${item.speakerName || 'LOCUTOR'}:</b> `;
                    if (item.intention) {
                        bHtml += `<b>(${item.intention})</b> `;
                    }
                }
                bHtml += `${replaceMarkdownBold(p)}</div>`;
                html += bHtml;
             });
          } else if (item.type === 'sound') {
             const paragraphs = item.text || [];
             paragraphs.forEach((p, idx) => {
                 const isFirst = idx === 0;
                 let cleanText = replaceMarkdownBold(p);
                 const indentStyle = isFirst ? '-2cm' : '0';
                 let bHtml = `<div style="margin-left: 2cm; text-indent: ${indentStyle};">`;
                 if (isFirst) {
                     cleanText = cleanText.replace(/^(?:SON|OP)\s*:?\s*/i, '').trim();
                     bHtml += `<b>${item.identifier} SON:</b> `;
                 }
                 bHtml += `<b><u>${cleanText}</u></b></div>`;
                 html += bHtml;
             });
          } else {
             const paragraphs = item.text || [];
             paragraphs.forEach(p => {
                 html += `<div style="margin-left: 2cm;">${replaceMarkdownBold(p)}</div>`;
             });
          }
       });
   }
   html += '</div>';
   return html;
}

export default function App() {
  const [docs, setDocs] = useState<DocumentItem[]>(() => {
    const saved = localStorage.getItem('radio_scripts_docs');
    return saved ? JSON.parse(saved) : [];
  });
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  // Sync with localStorage
  useEffect(() => {
    localStorage.setItem('radio_scripts_docs', JSON.stringify(docs));
  }, [docs]);

  const activeDoc = docs.find(d => d.id === activeDocId);
  
  const inputText = activeDoc?.inputText || '';
  const scriptData = activeDoc?.scriptData || null;
  const originalScriptData = activeDoc?.originalScriptData || null;
  const editorHtml = activeDoc?.editorHtml || '';
  const externalVersion = activeDoc?.externalVersion || 0;
  const history = activeDoc?.history || [];
  const isDirty = activeDoc?.isDirty || false;

  const updateActiveDoc = (updates: Partial<DocumentItem>) => {
      setDocs(prev => prev.map(d => d.id === activeDocId ? { ...d, ...updates } : d));
  };

  const setInputText = (v: string | ((prev: string) => string)) => {
      const val = typeof v === 'function' ? v(inputText) : v;
      if (!activeDocId) {
          const newId = Date.now().toString();
          const newDoc: DocumentItem = {
              id: newId,
              originalFileName: 'Nuevo Documento',
              inputText: val,
              scriptData: null,
              originalScriptData: null,
              editorHtml: '',
              externalVersion: 0,
              history: [],
              isDirty: false
          };
          setDocs(prev => [...prev, newDoc]);
          setActiveDocId(newId);
          return;
      }
      updateActiveDoc({ inputText: val });
  };
  const setScriptData = (v: RadioScript | null) => updateActiveDoc({ scriptData: v });
  const setOriginalScriptData = (v: RadioScript | null) => updateActiveDoc({ originalScriptData: v });
  const setEditorHtml = (v: string | ((prev: string) => string)) => updateActiveDoc({ editorHtml: typeof v === 'function' ? v(editorHtml) : v });
  const setExternalVersion = (v: number | ((prev: number) => number)) => updateActiveDoc({ externalVersion: typeof v === 'function' ? v(externalVersion) : v });
  const setHistory = (v: string[] | ((prev: string[]) => string[])) => updateActiveDoc({ history: typeof v === 'function' ? v(history) : v });
  const setIsDirty = (v: boolean) => updateActiveDoc({ isDirty: v });

  const [isProcessing, setIsProcessing] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInforme, setShowInforme] = useState(false);
  const [formatMode, setFormatMode] = useState<'all' | 'numbering' | 'credits'>('all');

  // Debounced history capture
  useEffect(() => {
    const timer = setTimeout(() => {
      setHistory(prev => {
        const currentStr = editorHtml || '';
        if (prev.length === 0 || prev[prev.length - 1] !== currentStr) {
          return [...prev, currentStr].slice(-50); // limit to 50
        }
        return prev;
      });
    }, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [editorHtml]);
  const [commentModal, setCommentModal] = useState<{ active: boolean, range: Range | null }>({ active: false, range: null });
  const previewRef = useRef<HTMLElement>(null);
  
  // Mobile UI Tab State
  const [isClearingStock, setIsClearingStock] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'preview' | 'docs'>('input');
  
  // Settings state
  const [fontSize, setFontSize] = useState<number>(13);
  const [lineSpacing, setLineSpacing] = useState<number>(1.15);
  const [paragraphSpacing, setParagraphSpacing] = useState<number>(6);

  const [selectionStats, setSelectionStats] = useState<{ paragraphs: number, lines: number, words: number, repetitions: number } | null>(null);
  const [replaceModal, setReplaceModal] = useState<{ active: boolean, text: string, replaceWidth: string, isPattern: boolean }>({ active: false, text: "", replaceWidth: "", isPattern: false });
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
  }, [editorHtml, activeTab]);

  const handleSave = () => {
    setIsDirty(false);
  };

  const handleRevert = () => {
    if (history.length === 0) return;

    const currentSavedState = history[history.length - 1];
    
    // If the editor has changes that haven't been pushed to history yet (due to debounce)
    if (editorHtml !== currentSavedState) {
        setEditorHtml(currentSavedState);
        setExternalVersion(externalVersion + 1);
        setIsDirty(true);
        return;
    }

    // Otherwise, pop from history to go to previous state
    if (history.length > 1) {
        const newHistory = [...history];
        newHistory.pop(); // remove current state
        const prevState = newHistory[newHistory.length - 1];
        setEditorHtml(prevState);
        setExternalVersion(externalVersion + 1);
        setHistory(newHistory);
        setIsDirty(true);
    }
  };

  const requireSaveBeforeAction = (action: () => void) => {
    if (isDirty) {
      handleSave();
    }
    setTimeout(action, 0); 
  };

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const processScriptText = async (textToProcess: string, docId?: string) => {
    if (!textToProcess.trim()) return;
    setIsProcessing(true);
    setError(null);

    const targetDocId = docId || activeDocId;

    try {
      const localParsedData = parseScriptLocally(textToProcess);
      
      if (localParsedData) {
          const normalized = normalizeScriptNumbering(localParsedData, formatMode);
          const newHtml = scriptDataToHtml(normalized, formatMode);
          
          const autoName = getFileName(normalized).replace('.DOCX', '');

          setDocs(prev => prev.map(d => d.id === targetDocId ? {
              ...d,
              originalFileName: d.originalFileName === 'Nuevo Documento' ? autoName : d.originalFileName,
              scriptData: normalized,
              originalScriptData: JSON.parse(JSON.stringify(normalized)),
              editorHtml: newHtml,
              history: [newHtml],
              externalVersion: d.externalVersion + 1,
              inputText: textToProcess
          } : d));

          if (targetDocId === activeDocId) {
             if (window.innerWidth < 768) {
                setActiveTab('preview');
             }
             setTimeout(() => {
                if (scrollContainerRef.current) {
                   scrollContainerRef.current.scrollTop = 0;
                   scrollContainerRef.current.focus();
                }
             }, 300);
          }
      } else {
          throw new Error("No se pudo extraer el contenido. Revise el archivo.");
      }
    } catch (err: any) {
      console.error(err);
      if (targetDocId === activeDocId) setError(err?.message || "Ocurrió un error al generar el guion.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleGenerate = async () => {
    await processScriptText(inputText);
  };

  const handleClear = () => {
    setActiveDocId(null);
    setError(null);
  };

  const handleExportBackup = () => {
    const dataStr = JSON.stringify(docs, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    saveAs(blob, `Respaldo_Guiones_${new Date().toISOString().slice(0,10)}.json`);
  };

  const handleImportBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const imported = JSON.parse(content);
        if (Array.isArray(imported)) {
          setDocs(prev => [...prev, ...imported]);
          setError(null);
          if (imported.length > 0) setActiveDocId(imported[imported.length - 1].id);
        }
      } catch (err) {
        setError("Error al importar el respaldo. El archivo no es válido.");
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []) as File[];
    if (!files.length) return;

    setError(null);
    setIsProcessing(true);

    try {
        const newDocs: DocumentItem[] = [];
        
        for (const file of files) {
            let extractedText = '';

            if (file.name.toLowerCase().endsWith('.txt')) {
                 extractedText = await file.text();
            } else {
                 const arrayBuffer = await file.arrayBuffer();
                 const result = await mammoth.convertToHtml({ arrayBuffer });
                 let html = result.value;
                 html = html.replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, '\n');
                 html = html.replace(/<div[^>]*>/gi, '').replace(/<\/div>/gi, '\n');
                 html = html.replace(/<tr[^>]*>/gi, '').replace(/<\/tr>/gi, '\n');
                 html = html.replace(/<br\s*[\/]?>/gi, '\n');
                 extractedText = html
                     .replace(/&nbsp;/g, ' ')
                     .replace(/&amp;/g, '&')
                     .replace(/&lt;/g, '<')
                     .replace(/&gt;/g, '>')
                     .replace(/<(?!(\/)?(b|strong|i|em|u|span)\b)[^>]+>/gi, '') 
                     .replace(/ +/g, ' ')
                     .trim();
            }

            if (extractedText.length >= 20) {
               const newId = Date.now().toString() + Math.random().toString();
               newDocs.push({
                   id: newId,
                   originalFileName: file.name,
                   inputText: extractedText,
                   scriptData: null,
                   originalScriptData: null,
                   editorHtml: '',
                   externalVersion: 0,
                   history: [],
                   isDirty: false
               });
            }
        }
        
        if (newDocs.length === 0) {
            throw new Error("No se encontró texto legible en los archivos.");
        }
        
        setDocs(prev => [...prev, ...newDocs]);
        
        let firstActiveId = activeDocId;
        if (!activeDocId || files.length > 0) {
            firstActiveId = newDocs[0].id;
            setActiveDocId(newDocs[0].id);
        }
        
        for (const doc of newDocs) {
            await processScriptText(doc.inputText, doc.id);
        }
        
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    } catch (err: any) {
        console.error("Error reading docx/doc:", err);
        setError(err.message || "Error al leer el archivo.");
    } finally {
        setIsProcessing(false);
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

    if (script.isMonologo) {
        fileName = 'MONOLOGO ' + fileName;
    }
    
    return `${fileName.replace(/\s+/g, ' ').trim()}.DOCX`;
  };

  const handleDownload = async () => {
    if (!editorHtml) return;
    
    try {
      const blob = await generateDocxFromHtml(editorHtml, { fontSize, lineSpacing, paragraphSpacing });
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

  const handleDownloadAll = async () => {
    if (docs.length === 0) return;
    
    setIsProcessing(true);
    
    try {
      if (docs.length === 1) {
          // If only one, just download it directly
          await handleDownload();
          setIsProcessing(false);
          return;
      }

      const zip = new JSZip();
      
      const namesUsed = new Set<string>();
      
      for (const doc of docs) {
         if (!doc.editorHtml) continue;
         const blob = await generateDocxFromHtml(doc.editorHtml, { fontSize, lineSpacing, paragraphSpacing });
         const resolvedFileName = getFileName(doc.scriptData);
         
         let uniqueName = resolvedFileName;
         let counter = 1;
         const baseNameNoExt = resolvedFileName.replace(/\.DOCX$/i, '').trim();
         
         while (namesUsed.has(uniqueName.toUpperCase())) {
             uniqueName = `${baseNameNoExt} (${counter++}).DOCX`;
         }
         
         namesUsed.add(uniqueName.toUpperCase());
         zip.file(uniqueName, blob);
      }
      
      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, 'Guiones_Formateados.zip');
      
    } catch (err) {
      console.error("Error creating zip:", err);
      setError("Error al crear el archivo ZIP.");
    } finally {
      setIsProcessing(false);
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

  const executeFormat = (cmd: string, val?: string) => {
      document.execCommand(cmd, false, val);
      setIsDirty(true);
  };

  const executeCase = (toUpper: boolean) => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
      const text = selection.toString();
      document.execCommand('insertText', false, toUpper ? text.toUpperCase() : text.toLowerCase());
      setIsDirty(true);
  };

  const handleOpenReplace = () => {
       const selection = window.getSelection();
       const selectedText = selection?.toString().trim() || "";
       let isPattern = false;
       if (/^\[.*?\]$/.test(selectedText) || /^\(.*?(\d+)?.*?\)$/.test(selectedText)) {
           isPattern = true;
       }
       setReplaceModal({ active: true, text: selectedText, replaceWidth: "", isPattern });
  };

  const handleReplaceAll = (forceReplacement?: string) => {
       if (!replaceModal.text || !editorHtml) return;
       const { text, isPattern } = replaceModal;
       const rep = forceReplacement !== undefined ? forceReplacement : replaceModal.replaceWidth;

       let regex: RegExp;
       if (isPattern) {
          if (text.startsWith('(')) {
              const prefixMatch = text.match(/^\((.*?)\d+/);
              if (prefixMatch && prefixMatch[1]) {
                  const safePrefix = prefixMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  regex = new RegExp(`\\(${safePrefix}\\d+[^)]*\\)`, 'g');
              } else {
                  regex = /\([^)]*\)/g;
              }
          } else {
              const match = text.match(/^\[(.*?)(\s+\d+)?\]$/);
              if (match) {
                  const baseWord = match[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  regex = new RegExp(`\\[\\s*${baseWord}\\s*(\\d+)?\\s*\\]`, 'gi');
              } else {
                  regex = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
              }
          }
       } else {
          regex = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
       }

       const newHtml = editorHtml.replace(regex, rep);
       setEditorHtml(newHtml);
       setExternalVersion(externalVersion + 1);
       
       setReplaceModal({ active: false, text: "", replaceWidth: "", isPattern: false });
       setIsDirty(true);
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
                    <span>Documento: </span><span className="font-bold text-slate-700">{getFileName(scriptData)}</span>
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
                    {docs.length > 1 && (
                      <button 
                        onClick={() => requireSaveBeforeAction(handleDownloadAll)}
                        className="bg-indigo-800 hover:bg-indigo-900 text-white px-3 py-1.5 rounded font-bold text-[10px] sm:text-xs flex items-center justify-center shadow-sm transition-colors"
                        title="Descargar TODOS los DOCX (ZIP)"
                      >
                        <Download className="w-3 h-3 sm:mr-1 shrink-0" />
                        <span className="hidden sm:inline">TODOS (ZIP)</span>
                      </button>
                    )}
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

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0 bg-slate-100">
        
        {/* Mobile Tabs */}
        <div className="md:hidden flex bg-white border-b border-slate-200 p-2 shrink-0 space-x-2 z-20">
          <button 
            className={`flex-1 py-3 text-xs font-bold uppercase rounded transition-all ${activeTab === 'input' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500'}`}
            onClick={() => setActiveTab('input')}
          >
            Entrada Datos
          </button>
          <button 
             className={`flex-1 py-3 text-xs font-bold uppercase rounded transition-all ${activeTab === 'preview' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500'}`}
             onClick={() => setActiveTab('preview')}
          >
             Vista Previa
          </button>
          <button 
             className={`flex-1 py-3 text-xs font-bold uppercase rounded transition-all ${activeTab === 'docs' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500'}`}
             onClick={() => setActiveTab('docs')}
          >
             Documentos
          </button>
        </div>

        {/* Input Area */}
        <section className={`w-full md:w-[28%] md:min-w-[280px] md:max-w-[360px] border-b md:border-b-0 md:border-r border-slate-300 bg-slate-50 flex-col z-10 overflow-hidden ${activeTab === 'input' ? 'flex' : 'hidden md:flex'}`}>
          <div className="p-4 border-b border-slate-200 bg-slate-100 flex justify-between items-center shrink-0">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Entrada & Configuración</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
            
            {/* Action Bar: File Upload */}
            <div className="flex items-center justify-between">
                <div className="w-full">
                    <input 
                      type="file" 
                      multiple
                      accept=".docx,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" 
                      ref={fileInputRef}
                      onChange={handleFileUpload} 
                      className="hidden" 
                      id="docx-upload"
                    />
                    <label 
                      htmlFor="docx-upload" 
                      className="cursor-pointer w-full bg-white border border-dashed border-indigo-200 hover:border-indigo-400 hover:bg-white text-slate-600 px-4 py-8 rounded-xl text-[10px] font-bold uppercase tracking-wider flex flex-col items-center justify-center transition-all shadow-sm group"
                    >
                      <Upload className="w-8 h-8 mb-3 text-indigo-500 group-hover:scale-110 transition-transform" />
                      <span className="text-center">Cargar Documentos<br/>(.docx, .txt)</span>
                    </label>
                </div>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg text-xs font-medium animate-shake">
                {error}
              </div>
            )}
            <div className="flex-1 flex flex-col min-h-[250px]">
              <div className="flex justify-between items-center mb-1.5 ml-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Texto a Formatear
                </label>
                <button 
                  type="button"
                  onClick={handleClear}
                  className="text-indigo-600 hover:text-indigo-800 flex items-center transition-colors text-[10px] font-bold uppercase tracking-wider"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  <span>REINICIAR</span>
                </button>
              </div>
              <textarea 
                className="flex-1 w-full bg-white border border-slate-300 rounded-xl p-4 text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none shadow-sm transition-shadow" 
                placeholder="Pegue aquí el texto original o cargue un archivo .docx..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={isProcessing}
              />
            </div>

            {/* Formatting Settings */}
            <div className="bg-white p-4 border border-slate-200 rounded-lg shadow-sm space-y-4">
                <div className="flex items-center space-x-2 text-slate-700 mb-2 border-b border-slate-50 pb-2">
                    <Settings className="w-4 h-4 text-indigo-500" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Ajustes de Edición</span>
                </div>
                
                <div className="space-y-1 mb-4">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">Formato de Guion</label>
                    <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input 
                                type="radio" 
                                name="formatMode" 
                                value="all" 
                                checked={formatMode === 'all'}
                                onChange={() => {
                                    setFormatMode('all');
                                    // if (inputText) setTimeout(() => processScriptText(inputText), 0);
                                }}
                                className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Todos los cambios</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input 
                                type="radio" 
                                name="formatMode" 
                                value="numbering" 
                                checked={formatMode === 'numbering'}
                                onChange={() => {
                                    setFormatMode('numbering');
                                }}
                                className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Numeración</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input 
                                type="radio" 
                                name="formatMode" 
                                value="credits" 
                                checked={formatMode === 'credits'}
                                onChange={() => {
                                    setFormatMode('credits');
                                }}
                                className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span>Créditos</span>
                        </label>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tamaño Letra</label>
                        <select 
                            value={fontSize} 
                            onChange={(e) => setFontSize(Number(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                            <option value={1}>1.0</option>
                            <option value={1.15}>1.15</option>
                            <option value={1.5}>1.5</option>
                        </select>
                    </div>
                    <div className="space-y-1 col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Espacio entre Párrafos</label>
                        <select 
                            value={paragraphSpacing} 
                            onChange={(e) => setParagraphSpacing(Number(e.target.value))}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-4 rounded-xl font-bold text-sm flex items-center justify-center shadow-lg shadow-indigo-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 mb-4"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  <span>GENERANDO...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  <span>GENERAR FORMATO</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* Preview Area */}
        <section 
           ref={previewRef}
           style={{ WebkitOverflowScrolling: 'touch' }}
           className={`flex-1 flex flex-col relative overflow-hidden bg-slate-200 min-h-0 ${activeTab === 'preview' ? 'flex' : 'hidden md:flex'}`}
        >
          {scriptData && (
             <EditorToolbar 
                onAddComment={handleAddComment} 
                onSave={handleSave} 
                onRevert={handleRevert} 
                onReplace={handleOpenReplace}
                isDirty={isDirty} 
             />
          )}

          <div 
            ref={scrollContainerRef}
            tabIndex={0}
            className="flex-1 overflow-y-auto w-full flex flex-col items-center bg-slate-100 relative py-12 pb-64 focus:outline-none"
            style={{ userSelect: 'text' }}
            onMouseUp={handleSelection}
            onKeyUp={handleSelection}
            onCopy={(e) => {
               const selection = window.getSelection();
               if (selection && !selection.isCollapsed) {
                   e.preventDefault();
                   e.clipboardData.setData('text/plain', selection.toString());
                   e.clipboardData.setData('text/html', selection.toString().replace(/\n/g, '<br>'));
               }
            }}
            onCut={(e) => {
               const selection = window.getSelection();
               if (selection && !selection.isCollapsed) {
                   e.preventDefault();
                   e.clipboardData.setData('text/plain', selection.toString());
                   document.execCommand('delete');
               }
            }}
            onPaste={(e) => {
               // Only intercept if pasting into content editable
               if (document.activeElement?.hasAttribute('contenteditable')) {
                  e.preventDefault();
                  const text = e.clipboardData.getData('text/plain');
                  document.execCommand('insertText', false, text);
               }
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                  e.preventDefault();
                  handleRevert();
                  return;
              }

              // Si el usuario está editando un bloque, permitimos las flechas para mover el cursor
              if ((e.target as HTMLElement).isContentEditable || 
                  (e.target as HTMLElement).tagName === 'INPUT' || 
                  (e.target as HTMLElement).tagName === 'TEXTAREA' ||
                  (e.target as HTMLElement).tagName === 'SELECT') {
                return;
              }

              if (e.key === 'ArrowDown') {
                e.preventDefault();
                scrollContainerRef.current?.scrollBy({ top: 60, behavior: 'smooth' });
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                scrollContainerRef.current?.scrollBy({ top: -60, behavior: 'smooth' });
              }
            }}
          >
            {(originalScriptData || editorHtml !== '') ? (
                /* The "Paper" - Carta (Letter) Size: 21.59cm x 27.94cm. Using flex-col and h-auto to ensure background covers all text. */
                <div 
                  className="w-full max-w-[21.59cm] min-h-[27.94cm] h-auto bg-white shadow-xl relative mb-12 flex flex-col shrink-0" 
                >
                     <EditorBlock 
                        key={activeDocId || 'none'}
                        className="p-8 sm:p-[1.5cm] sm:pt-[2cm] sm:pb-[2.5cm] flex-1 min-h-full block w-full outline-none focus:outline-none focus:ring-0"
                        html={editorHtml}
                        externalVersion={externalVersion}
                        onChange={(html) => {
                             setEditorHtml(html);
                             setIsDirty(true);
                        }}
                        style={{ 
                            fontFamily: 'Arial, sans-serif',
                            fontSize: `${fontSize}pt`,
                            lineHeight: lineSpacing,
                            color: '#000'
                        }}
                     />
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center max-w-sm">
                    <div className="bg-slate-300 w-24 h-24 rounded-full flex items-center justify-center mb-6 shadow-inner">
                        <Sparkles className="w-12 h-12 text-slate-100" />
                    </div>
                    <h3 className="font-bold text-slate-600 uppercase tracking-widest mb-2">Editor Radiofónico</h3>
                    <p className="text-sm">Pegue su texto en el panel izquierdo y presione <strong>GENERAR FORMATO</strong> para comenzar la edición profesional.</p>
                </div>
            )}
          </div>
        </section>

        {/* Document List Sidebar */}
        <section className={`w-full md:w-[22%] md:min-w-[240px] md:max-w-[300px] border-l border-slate-300 bg-slate-50 flex-col z-10 overflow-hidden ${activeTab === 'docs' ? 'flex' : 'hidden md:flex'}`}>
            <div className="p-4 border-b border-slate-200 bg-slate-100 flex justify-between items-center shrink-0">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Documentos ({docs.length})</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                {docs.length === 0 ? (
                    <div className="text-center text-slate-400 p-4 text-xs font-medium border border-dashed border-slate-300 rounded-lg m-2">
                        No hay documentos cargados.
                    </div>
                ) : docs.map(doc => {
                    const isDocx = doc.originalFileName.toLowerCase().endsWith('.docx') || doc.originalFileName.toLowerCase().endsWith('.doc');
                    return (
                        <div 
                            key={doc.id}
                            onClick={() => { setActiveDocId(doc.id); if (window.innerWidth < 768) setActiveTab('preview'); }}
                            className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center gap-3 relative overflow-hidden group ${activeDocId === doc.id ? 'bg-indigo-50 border-indigo-300 shadow-sm' : 'bg-white border-slate-200 hover:border-indigo-200 hover:bg-slate-50'}`}
                        >
                            <div className={`p-2 rounded shrink-0 ${activeDocId === doc.id ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                                <FileText className="w-5 h-5" />
                            </div>
                                <div className="flex-1 min-w-0 pr-6">
                                    <p className={`text-xs font-bold truncate ${activeDocId === doc.id ? 'text-indigo-900' : 'text-slate-700'}`}>
                                        {doc.originalFileName}
                                    </p>
                                    <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                        {isDocx ? 'Documento Word' : 'Archivo de Texto'}
                                    </p>
                                </div>
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDocs(prev => prev.filter(d => d.id !== doc.id));
                                            if (activeDocId === doc.id) setActiveDocId(null);
                                        }}
                                        className="p-1.5 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                        title="Eliminar documento"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    {activeDocId === doc.id && (
                                        <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0 bg-white rounded-full" />
                                    )}
                                    {doc.isDirty && activeDocId !== doc.id && (
                                        <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                                    )}
                                </div>
                        </div>
                    );
                })}
            </div>
            
            {docs.length > 0 && (
                <div className="p-3 border-t border-slate-200 bg-white flex flex-col gap-2 shrink-0">
                    <div className="flex gap-2">
                         <button 
                            onClick={handleExportBackup}
                            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg text-[10px] font-bold flex items-center justify-center transition-colors border border-slate-200"
                        >
                            <Download className="w-3 h-3 mr-1" /> <span>RESPALDO</span>
                        </button>
                        <label className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg text-[10px] font-bold flex items-center justify-center transition-colors border border-slate-200 cursor-pointer">
                            <Upload className="w-3 h-3 mr-1" /> <span>CARGAR</span>
                            <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
                        </label>
                    </div>
                    <button 
                        onClick={() => {
                            if (isClearingStock) {
                                setDocs([]);
                                setActiveDocId(null);
                                setIsClearingStock(false);
                            } else {
                                setIsClearingStock(true);
                                setTimeout(() => setIsClearingStock(false), 3000);
                            }
                        }}
                        className={`w-full py-2 rounded-lg text-[10px] font-bold flex items-center justify-center transition-all border ${
                            isClearingStock 
                            ? 'bg-red-600 text-white border-red-700 animate-pulse' 
                            : 'bg-slate-50 hover:bg-red-50 hover:text-red-600 text-slate-400 border-slate-100 hover:border-red-200'
                        }`}
                    >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" /> 
                        <span>{isClearingStock ? '¿ESTÁS SEGURO? CLIC DE NUEVO' : 'LIMPIAR STOCK'}</span>
                    </button>
                </div>
            )}
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

      {isProcessing && (
         <div className="fixed inset-0 bg-slate-900/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl p-8 flex flex-col items-center animate-in zoom-in-95 duration-200">
               <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
               <h3 className="text-lg font-bold text-slate-800">Procesando Documento</h3>
               <p className="text-sm text-slate-500 mt-2 text-center max-w-[250px]">Analizando estructura y aplicando el formato...</p>
            </div>
         </div>
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
            <span>{activeTooltip.text}</span>
            <div className="absolute top-0 left-1/2 -mt-1 w-2 h-2 bg-slate-800 rotate-45 -translate-x-1/2"></div>
          </div>
      )}

      {replaceModal.active && (
          <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4">
             <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-4 animate-in fade-in zoom-in-95 duration-200">
               <div className="flex justify-between items-center mb-4">
                   <h3 className="text-sm font-bold text-slate-800">Buscar y Reemplazar</h3>
                   <button onClick={() => setReplaceModal({ ...replaceModal, active: false })} className="text-slate-400 hover:text-slate-600">✕</button>
               </div>
               <div className="space-y-4">
                   <div>
                       <label className="block text-xs font-bold text-slate-500 mb-1">Buscar ({replaceModal.isPattern ? 'Patrón similar' : 'Texto exacto'}):</label>
                       <input 
                           type="text" 
                           value={replaceModal.text}
                           onChange={(e) => setReplaceModal({ ...replaceModal, text: e.target.value })}
                           className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                       />
                   </div>
                   <div>
                       <label className="block text-xs font-bold text-slate-500 mb-1">Reemplazar con:</label>
                       <input 
                           type="text" 
                           value={replaceModal.replaceWidth}
                           onChange={(e) => setReplaceModal({ ...replaceModal, replaceWidth: e.target.value })}
                           placeholder="Dejar vacío para borrar..."
                           className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                       />
                   </div>
                   <div className="flex space-x-2 pt-2">
                        <button 
                           onClick={() => { handleReplaceAll(""); }} 
                           className="flex-1 px-3 py-2 text-xs bg-red-100 text-red-700 rounded font-bold hover:bg-red-200 cursor-pointer text-center uppercase"
                        >
                           {replaceModal.isPattern ? 'Borrar Similares' : 'Eliminar Texto'}
                        </button>
                        <button 
                           onClick={() => handleReplaceAll()}
                           className="flex-1 px-3 py-2 text-xs bg-indigo-600 text-white rounded font-bold hover:bg-indigo-700 cursor-pointer text-center uppercase"
                        >
                           Reemplazar
                        </button>
                   </div>
               </div>
             </div>
          </div>
      )}
    </div>
  );
}
