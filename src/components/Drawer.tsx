import {useEffect, useRef} from 'react';
import type {JSX, ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {Icon} from './Icon.tsx';

export type DrawerSide = 'library' | 'inspector';
interface DrawerProps {
  side: DrawerSide;
  title: string;
  open: boolean;
  compact: boolean;
  onClose: () => void;
  children: ReactNode;
}
export function Drawer({
  side,
  title,
  open,
  compact,
  onClose,
  children,
}: DrawerProps): JSX.Element | null {
  const {t} = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!compact || !open || !element) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [open, compact]);
  if (!open) return null;
  const content = (
    <>
      <div className="drawer-heading">
        <h2 id={`${side}-title`}>{title}</h2>
        <button
          className="icon-button drawer-close"
          aria-label={t(side === 'library' ? 'closeComponents' : 'closeInspector')}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </>
  );
  if (compact)
    return (
      <dialog
        className={`drawer mobile-drawer ${side}`}
        id={`${side}-drawer`}
        aria-labelledby={`${side}-title`}
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          onClose();
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose();
        }}
      >
        {content}
      </dialog>
    );
  return (
    <aside className={`drawer ${side}`} id={`${side}-drawer`} aria-labelledby={`${side}-title`}>
      {content}
    </aside>
  );
}
