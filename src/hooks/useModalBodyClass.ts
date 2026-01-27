import { useEffect } from "react";

let openModalCount = 0;

const updateBodyClass = () => {
  if (typeof document === "undefined") return;
  if (openModalCount > 0) {
    document.body.classList.add("modal-open");
  } else {
    document.body.classList.remove("modal-open");
  }
};

export const useModalBodyClass = (isOpen: boolean) => {
  useEffect(() => {
    if (!isOpen) return;
    openModalCount += 1;
    updateBodyClass();
    return () => {
      openModalCount = Math.max(0, openModalCount - 1);
      updateBodyClass();
    };
  }, [isOpen]);
};
