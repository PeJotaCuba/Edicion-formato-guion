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

  // Set initial content and handle external updates
  useEffect(() => {
    if (contentEditableRef.current && lastHtmlRef.current !== html) {
      // If the html prop diverges from our last seen internal state,
      // it means an external event (Undo, Replace All, etc.) happened.
      // We must sync the DOM even if focused, though this may move the caret.
      contentEditableRef.current.innerHTML = html;
      lastHtmlRef.current = html;
    }
  }, [html]);

  // Initial mount: ensure innerHTML is set if not already handled by useEffect above
  useEffect(() => {
    if (contentEditableRef.current && !contentEditableRef.current.innerHTML && html) {
      contentEditableRef.current.innerHTML = html;
      lastHtmlRef.current = html;
    }
  }, []);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    const newHtml = e.currentTarget.innerHTML;
    // Update ref immediately to prevent the useEffect from triggering a redundant update
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
    // Only re-render if html actually changes to something we haven't seen.
    // We also ignore style and className changes if they are deep-equal but for simplicity 
    // we'll just check what's necessary.
    return prev.html === next.html && 
           prev.className === next.className &&
           JSON.stringify(prev.style) === JSON.stringify(next.style);
});
