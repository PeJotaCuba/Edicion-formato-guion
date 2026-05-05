import React, { useRef, useEffect, memo } from 'react';

interface EditorBlockProps {
  html: string;
  externalVersion?: number; // Only updates innerHTML when this changes
  onChange: (newHtml: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const EditorBlock = memo(function EditorBlock({ html, externalVersion = 0, onChange, className, style }: EditorBlockProps) {
  const contentEditableRef = useRef<HTMLDivElement>(null);
  const lastVersionRef = useRef(externalVersion);
  const lastHtmlRef = useRef(html);

  // Sync incoming html changes ONLY when externalVersion changes (e.g. Undo, Revert)
  // or on initial mount where DOM is empty
  useEffect(() => {
    if (!contentEditableRef.current) return;
    
    // Check if the external version incremented, or if the DOM is completely empty but we have html
    if (externalVersion !== lastVersionRef.current || (html && !contentEditableRef.current.innerHTML)) {
        contentEditableRef.current.innerHTML = html;
        lastHtmlRef.current = html;
        lastVersionRef.current = externalVersion;
    }
  }, [html, externalVersion]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    // Only update ref and trigger onChange, let DOM be uncontrolled
    const newHtml = e.currentTarget.innerHTML;
    lastHtmlRef.current = newHtml;
    onChange(newHtml);
  };

  return (
    <div
      ref={contentEditableRef}
      contentEditable={true}
      suppressContentEditableWarning
      onInput={handleInput}
      className={`focus:outline-none transition-all ${className}`}
      style={{ ...style, cursor: 'text' }}
    />
  );
}, (prev, next) => {
    return prev.html === next.html && 
           prev.externalVersion === next.externalVersion &&
           prev.className === next.className &&
           JSON.stringify(prev.style) === JSON.stringify(next.style);
});

