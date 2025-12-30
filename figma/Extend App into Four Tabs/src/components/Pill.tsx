import { cn } from './ui/utils';

interface PillProps {
  children: React.ReactNode;
  variant?: 'default' | 'pos' | 'frequency' | 'level';
  className?: string;
  onClick?: () => void;
}

const variantStyles = {
  default: 'bg-muted text-muted-foreground',
  pos: 'bg-emerald-500/20 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400',
  frequency: 'bg-blue-500/20 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',
  level: 'bg-purple-500/20 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400',
};

export function Pill({ children, variant = 'default', className, onClick }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] uppercase tracking-wide',
        variantStyles[variant],
        onClick && 'cursor-pointer hover:opacity-80',
        className
      )}
      onClick={onClick}
    >
      {children}
    </span>
  );
}
