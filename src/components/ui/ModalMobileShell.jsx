function ModalMobileShell({
  children,
  ariaLabelledby,
  backdropClassName = "bg-slate-950/45",
  panelClassName = "",
  maxWidthClassName = "max-w-lg"
}) {
  return (
    <div
      className={`fixed inset-0 z-[60] flex items-end justify-center ${backdropClassName} pt-2 sm:items-center sm:p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaLabelledby}
    >
      <div
        className={`max-h-[calc(100dvh-0.5rem)] w-full ${maxWidthClassName} overflow-y-auto overscroll-contain rounded-t-2xl bg-white px-4 pt-4 [padding-bottom:max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl sm:pb-4 ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
}

export default ModalMobileShell;
