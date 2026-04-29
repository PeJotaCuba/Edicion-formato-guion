import React, { useRef, useEffect, useState } from 'react';

interface EditorBlockProps {
  html: string;
  onChange: (newHtml: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function EditorBlock({ html, onChange, className, style }: EditorBlockProps) {
  const contentEditableRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (contentEditableRef.current && !isFocused && contentEditableRef.current.innerHTML !== html) {
      contentEditableRef.current.innerHTML = html;
    }
  }, [html, isFocused]);

  const handleInput = (e: React.FormEvent<HTMLDivElement>) => {
    onChange(e.currentTarget.innerHTML);
  };

  return (
    <div
      ref={contentEditableRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      className={`focus:outline-none focus:ring-1 focus:ring-indigo-300 rounded-sm transition-all ${className}`}
      style={{ ...style, cursor: 'text' }}
    />
  );
}
