import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

type ContentProps = React.PropsWithChildren<{ className?: string; style?: React.CSSProperties }>;

export const ContextMenuContent: React.FC<ContentProps> = ({ children, className = '', style }) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content
      className={`tw-min-w-[160px] tw-overflow-hidden tw-rounded-md tw-border tw-border-neutral-700 tw-text-neutral-100 tw-shadow-lg tw-z-[10000] ${className}`}
      style={{ backgroundColor: '#141414', ...style }}
    >
      {children}
    </ContextMenuPrimitive.Content>
  </ContextMenuPrimitive.Portal>
);

export const ContextMenuItem: React.FC<React.PropsWithChildren<{ inset?: boolean; onSelect?: () => void; className?: string }>> = ({ inset, onSelect, className = '', children }) => (
  <ContextMenuPrimitive.Item
    onSelect={onSelect}
    className={`tw-relative tw-flex tw-cursor-default tw-select-none tw-items-center tw-px-3 tw-py-1.5 tw-text-sm hover:tw-bg-neutral-800 ${inset ? 'tw-pl-8' : ''} ${className}`}
  >
    {children}
  </ContextMenuPrimitive.Item>
);

export const ContextMenuSeparator = () => (
  <ContextMenuPrimitive.Separator className="tw-h-px tw-bg-neutral-800" />
);


