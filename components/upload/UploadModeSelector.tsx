'use client';

import { RefreshCw, PlusCircle, GitMerge } from 'lucide-react';

export type UploadMode = 'replace' | 'append' | 'upsert';

interface ModeOption {
  value:       UploadMode;
  label:       string;
  icon:        React.ElementType;
  description: string;
  badge?:      string;
}

const OPTIONS: ModeOption[] = [
  {
    value:       'replace',
    label:       'Replace',
    icon:        RefreshCw,
    description: 'Delete existing records for this period and load fresh data from the file.',
    badge:       'Default',
  },
  {
    value:       'append',
    label:       'Append',
    icon:        PlusCircle,
    description: 'Add new rows without modifying or removing existing records.',
  },
  {
    value:       'upsert',
    label:       'Upsert',
    icon:        GitMerge,
    description: 'Update rows that match by key; insert rows that do not exist yet.',
  },
];

interface UploadModeSelectorProps {
  value:    UploadMode;
  onChange: (mode: UploadMode) => void;
  disabled?: boolean;
}

export function UploadModeSelector({ value, onChange, disabled = false }: UploadModeSelectorProps) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="sr-only">Upload mode</legend>
      {OPTIONS.map(({ value: modeVal, label, icon: Icon, description, badge }) => {
        const selected = value === modeVal;
        return (
          <button
            key={modeVal}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(modeVal)}
            className={[
              'w-full text-left flex items-start gap-3 px-3.5 py-3 rounded-lg border',
              'transition-all duration-150 outline-none',
              'focus-visible:ring-2 focus-visible:ring-gold/50',
              selected
                ? 'border-gold/60 bg-amber-50/60 shadow-sm'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80',
              disabled && 'opacity-50 cursor-not-allowed',
            ].join(' ')}
          >
            {/* Radio indicator */}
            <div
              className={[
                'mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                selected ? 'border-gold' : 'border-slate-300',
              ].join(' ')}
            >
              {selected && <div className="w-1.5 h-1.5 rounded-full bg-gold" />}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Icon
                  size={13}
                  className={selected ? 'text-gold' : 'text-slate-400'}
                  strokeWidth={selected ? 2.5 : 2}
                />
                <span className={`font-sans font-semibold text-sm ${selected ? 'text-slate-800' : 'text-slate-600'}`}>
                  {label}
                </span>
                {badge && (
                  <span className="text-[10px] font-sans font-bold uppercase tracking-wider bg-gold/20 text-gold-dark px-1.5 py-0.5 rounded-sm">
                    {badge}
                  </span>
                )}
              </div>
              <p className="font-sans text-xs text-slate-500 leading-relaxed">{description}</p>
            </div>
          </button>
        );
      })}
    </fieldset>
  );
}
