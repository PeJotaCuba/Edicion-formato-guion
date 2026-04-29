import React, { useState } from 'react';
import { X, Download, Share2 } from 'lucide-react';
import { RadioScript } from '../types';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

interface InformeModalProps {
  original: RadioScript | null;
  current: RadioScript | null;
  onClose: () => void;
}

export function InformeModal({ original, current, onClose }: InformeModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  if (!original || !current) return null;

  const changes: any[] = [];
  const comments: any[] = [];

  const extractComments = (html: string, contextLabel: string) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    const marks = div.querySelectorAll('mark.comment-mark');
    marks.forEach(m => {
       const text = m.getAttribute('data-comment');
       if (text) {
           comments.push({
               context: contextLabel,
               selectedText: m.textContent,
               commentText: text
           });
       }
    });
  };

  const stripHtml = (html: string) => {
      const div = document.createElement('div');
      div.innerHTML = html;
      div.querySelectorAll('mark.comment-mark').forEach(m => {
          m.replaceWith(m.textContent || '');
      });
      return div.innerHTML.trim();
  };

  // Diff Credits
  for (let i = 0; i < Math.min(original.credits.length, current.credits.length); i++) {
     const origC = original.credits[i];
     const currC = current.credits[i];
     extractComments(currC.value, `Créditos: ${currC.label}`);
     if (stripHtml(origC.value) !== stripHtml(currC.value)) {
         changes.push({
             index: 0,
             type: 'credito',
             identifier: currC.label,
             before: origC.value,
             after: currC.value
         });
     }
  }
  
  // Diff body
  for (let i = 0; i < Math.min(original.body.length, current.body.length); i++) {
    const origItem = original.body[i];
    const currItem = current.body[i];
    
    // Check paragraphs
    for (let p = 0; p < Math.min((origItem.text || []).length, (currItem.text || []).length); p++) {
       const origText = origItem.text[p];
       const currText = currItem.text[p];
       
       extractComments(currText, `Entrada #${i+1} (${currItem.type.replace('_', ' ')}) Pág. ${p+1}`);

       if (stripHtml(origText) !== stripHtml(currText)) {
          changes.push({
             index: i + 1,
             type: origItem.type,
             identifier: origItem.identifier,
             before: origText,
             after: currText
          });
       }
    }
  }

  const generateDocxBlob = async () => {
    const children: any[] = [];

    children.push(new Paragraph({
      text: "Informe de Cambios y Comentarios",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    }));

    if (comments.length > 0) {
      children.push(new Paragraph({ text: "Comentarios Insertados", heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }));
      comments.forEach(c => {
         children.push(new Paragraph({ text: `Contexto: ${c.context}`, bold: true, spacing: { before: 200 } }));
         children.push(new Paragraph({ text: `"${c.selectedText}"`, italics: true }));
         children.push(new Paragraph({ text: `Comentario: ${c.commentText}` }));
      });
    }

    if (changes.length > 0) {
      children.push(new Paragraph({ text: "Ediciones al Texto", heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }));
      changes.forEach(change => {
         const title = change.type === 'credito' ? `CRÉDITOS: ${change.identifier}` : `Entrada #${change.index} (${change.type === 'speaker' ? 'LOCUTOR' : change.type === 'sound' ? 'SONIDO' : 'TEXTO'}) ${change.identifier ? `- ORDEN: ${change.identifier}` : ''}`;
         children.push(new Paragraph({ text: title, bold: true, spacing: { before: 200 } }));
         children.push(new Paragraph({ text: "Original:" }));
         children.push(new Paragraph({ text: stripHtml(change.before), italics: true }));
         children.push(new Paragraph({ text: "Editado:" }));
         children.push(new Paragraph({ text: stripHtml(change.after) }));
      });
    }

    if (comments.length === 0 && changes.length === 0) {
      children.push(new Paragraph({ text: "No se han detectado cambios ni comentarios en el guion." }));
    }

    const doc = new Document({
      sections: [{ properties: {}, children }]
    });

    return await Packer.toBlob(doc);
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const blob = await generateDocxBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "INFORME_GUION.DOCX";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Error al generar el informe.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    setIsGenerating(true);
    try {
      const blob = await generateDocxBlob();
      const file = new File([blob], "INFORME_GUION.DOCX", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Informe de Guion',
          text: 'Revisa el informe de cambios y comentarios del guion.',
          files: [file]
        });
      } else {
        // Fallback for Whatsapp web
        window.open(`https://wa.me/?text=${encodeURIComponent('Revisa el informe de cambios y comentarios del guion generado en la plataforma de GuionFormat.')}`, '_blank');
      }
    } catch (e) {
      console.error(e);
      alert("No se pudo compartir el archivo directamente.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-800">Informe de Cambios y Comentarios</h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        
        <div className="p-4 flex-1 overflow-y-auto bg-slate-50">
          {comments.length > 0 && (
             <div className="mb-8">
                 <h3 className="text-md font-bold text-slate-700 mb-4 border-b pb-2">Comentarios Insertados</h3>
                 <div className="space-y-4">
                    {comments.map((c, idx) => (
                      <div key={idx} className="bg-white border-l-4 border-yellow-400 p-3 shadow-sm rounded">
                         <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{c.context}</div>
                         <div className="text-sm bg-yellow-50 p-2 italic rounded text-slate-700 mb-2 border border-yellow-100">
                             "{c.selectedText}"
                         </div>
                         <div className="text-sm font-medium text-slate-900">
                             🗨️ {c.commentText}
                         </div>
                      </div>
                    ))}
                 </div>
             </div>
          )}

          {changes.length === 0 && comments.length === 0 ? (
             <p className="text-slate-500 text-center py-8">No se han detectado cambios ni comentarios en el guion.</p>
          ) : changes.length > 0 ? (
             <div>
                 <h3 className="text-md font-bold text-slate-700 mb-4 border-b pb-2">Ediciones al Texto</h3>
                 <div className="space-y-6">
                    {changes.map((change, idx) => (
                      <div key={idx} className="border border-slate-200 rounded p-4 bg-white shadow-sm">
                        <div className="text-xs font-bold text-indigo-600 mb-2 uppercase">
                          {change.type === 'credito' ? `CRÉDITOS: ${change.identifier}` : `Entrada #${change.index} (${change.type === 'speaker' ? 'LOCUTOR' : change.type === 'sound' ? 'SONIDO' : 'TEXTO'}) ${change.identifier ? `- ORDEN: ${change.identifier}` : ''}`}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Original:</div>
                              <div className="text-sm text-slate-600 line-through opacity-70" dangerouslySetInnerHTML={{ __html: change.before }} />
                          </div>
                          <div>
                              <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Editado:</div>
                              <div className="text-sm text-slate-800" dangerouslySetInnerHTML={{ __html: change.after }} />
                          </div>
                        </div>
                      </div>
                    ))}
                 </div>
             </div>
          ) : null}
        </div>
        
        <div className="p-4 border-t border-slate-200 flex justify-end space-x-3 bg-white">
          <button 
             onClick={handleDownload} 
             disabled={isGenerating}
             className="px-4 py-2 bg-indigo-600 text-white rounded font-bold text-sm flex items-center hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4 mr-2" />
            DESCARGAR
          </button>
          <button 
             onClick={handleShare} 
             disabled={isGenerating}
             className="px-4 py-2 bg-green-600 text-white rounded font-bold text-sm flex items-center hover:bg-green-700 shadow-sm transition-colors disabled:opacity-50"
          >
            <Share2 className="w-4 h-4 mr-2" />
            COMPARTIR
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-slate-200 text-slate-700 rounded font-bold text-sm hover:bg-slate-300 transition-colors">
            CERRAR
          </button>
        </div>
      </div>
    </div>
  );
}
