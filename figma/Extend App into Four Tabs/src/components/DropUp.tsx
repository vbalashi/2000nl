import { useState, useRef, useEffect } from 'react';
import { ChevronUp } from 'lucide-react';

interface DropUpProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export function DropUp({ label, value, options, onChange }: DropUpProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropUpRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropUpRef.current && !dropUpRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="relative" ref={dropUpRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 hover:bg-muted transition-colors text-[11px] uppercase tracking-wide"
      >
        <span className="text-muted-foreground">{label}:</span>
        <span className="text-foreground">{selectedOption?.label || value}</span>
        <ChevronUp 
          className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} 
        />
      </button>

      {/* Dropdown menu (opens upward) */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 min-w-[200px] bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50">
          <div className="py-1">
            {options.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-muted/50 transition-colors ${
                  option.value === value
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
