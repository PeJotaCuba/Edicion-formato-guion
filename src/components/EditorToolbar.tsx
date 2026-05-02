import React from 'react';
import { Bold, Italic, Underline, Type, MessageSquarePlus, Save, RotateCcw, Search } from 'lucide-react';

interface EditorToolbarProps {
  onAddComment: () => void;
  onSave: () => void;
  onRevert: () => void;
  onReplace: () => void;
  isDirty: boolean;
}

export function EditorToolbar({ onAddComment, onSave, onRevert, onReplace, isDirty }: EditorToolbarProps) {
  const handleFormat = (command: string) => {
    document.execCommand(command, false, undefined);
  };

  const handleTransformCase = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const text = selection.toString();
    const isUppercase = text === text.toUpperCase();
    const newText = isUppercase ? text.toLowerCase() : text.toUpperCase();
    document.execCommand('insertText', false, newText);
  };

  return (
    <div className="flex items-center space-x-1 sm:space-x-2 bg-slate-100 p-2 border-b border-slate-300 shadow-sm shrink-0 sticky top-0 z-20 overflow-x-auto">
      <div className="flex items-center space-x-1 border-r border-slate-300 pr-2 shrink-0">
        <button
          onClick={() => handleFormat('bold')}
          className="p-1.5 sm:p-2 text-slate-700 hover:bg-white rounded transition-colors shadow-sm"
          title="Negrita"
        >
          <Bold className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
        <button
          onClick={() => handleFormat('italic')}
          className="p-1.5 sm:p-2 text-slate-700 hover:bg-white rounded transition-colors shadow-sm"
          title="Cursiva"
        >
          <Italic className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
        <button
          onClick={() => handleFormat('underline')}
          className="p-1.5 sm:p-2 text-slate-700 hover:bg-white rounded transition-colors shadow-sm"
          title="Subrayado"
        >
          <Underline className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
        <button
          onClick={handleTransformCase}
          className="p-1.5 sm:p-2 text-slate-700 hover:bg-white rounded transition-colors shadow-sm"
          title="Mayúsculas/Minúsculas"
        >
          <Type className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>

      <div className="flex items-center space-x-1 shrink-0 border-r border-slate-300 pr-2">
        <button
          onClick={onAddComment}
          className="p-1.5 sm:p-2 text-indigo-700 hover:bg-indigo-100 rounded transition-colors shadow-sm flex items-center"
          title="Añadir Comentario"
        >
          <MessageSquarePlus className="w-4 h-4 sm:w-5 sm:h-5 sm:mr-1" />
          <span className="hidden sm:inline text-xs font-bold uppercase">Comentario</span>
        </button>
      </div>

      <div className="flex items-center space-x-1 shrink-0">
        <button
          onClick={onRevert}
          disabled={!isDirty}
          className={`p-1.5 sm:p-2 rounded transition-colors shadow-sm flex items-center ${isDirty ? 'text-amber-700 hover:bg-amber-100' : 'text-slate-400 opacity-50 cursor-not-allowed'}`}
          title="Revertir Cambios"
        >
          <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 sm:mr-1" />
          <span className="hidden sm:inline text-xs font-bold uppercase">Revertir</span>
        </button>
        <button
          onClick={onReplace}
          className="p-1.5 sm:p-2 text-indigo-700 hover:bg-indigo-100 rounded transition-colors shadow-sm flex items-center"
          title="Buscar y Reemplazar"
        >
          <Search className="w-4 h-4 sm:w-5 sm:h-5 sm:mr-1" />
          <span className="hidden sm:inline text-xs font-bold uppercase">Reemplazar</span>
        </button>
        <button
          onClick={onSave}
          disabled={!isDirty}
          className={`p-1.5 sm:p-2 rounded transition-colors shadow-sm flex items-center ${isDirty ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-200 text-slate-400 opacity-50 cursor-not-allowed'}`}
          title="Guardar Cambios"
        >
          <Save className="w-4 h-4 sm:w-5 sm:h-5 sm:mr-1" />
          <span className="hidden sm:inline text-xs font-bold uppercase">Guardar</span>
        </button>
      </div>
    </div>
  );
}
