import React, { useRef, useEffect, useState, memo } from 'react';

interface EditorBlockProps {
  html: string;
  onChange: (newHtml: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const EditorBlock = memo(function EditorBlock({ html, onChange, className, style }: EditorBlockProps) {
  const contentEditableRef = useRef<HTMLDivElement>(null);
  const lastHtmlRef = useRef(html);
  const initialHtmlRef = useRef(html);

  useEffect(() => {
    if (contentEditableRef.current && lastHtmlRef.current !== html) {
      if (document.activeElement !== contentEditableRef.current) {
         contentEditableRef.current.innerHTML = html;
         lastHtmlRef.current = html;
      }
    }
  }, [html]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const newHtml = e.currentTarget.innerHTML;
    if (lastHtmlRef.current !== newHtml) {
        lastHtmlRef.current = newHtml;
        onChange(newHtml);
    }
  };

  return (
    <span
      ref={contentEditableRef}
      contentEditable={true}
      suppressContentEditableWarning
      onInput={handleInput}
      className={`focus:outline-none transition-all ${className}`}
      style={{ ...style, cursor: 'text' }}
      dangerouslySetInnerHTML={{ __html: initialHtmlRef.current }}
    />
  );
}, (prev, next) => {
    // Only re-render if html actually changes to something we haven't seen.
    // Also ignores in-line functions like onChange by not checking them.
    return prev.html === next.html && prev.className === next.className;
});
