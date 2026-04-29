type StorageLike = {
  getItem?: (key: string) => string | null;
  setItem?: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
  clear?: () => void;
  key?: (index: number) => string | null;
  length?: number;
};

function normalizeGlobalLocalStorage(): void {
  const globalStorage = (globalThis as { localStorage?: StorageLike })
    .localStorage;

  if (!globalStorage || typeof globalStorage !== "object") {
    return;
  }

  if (
    typeof globalStorage.getItem === "function" &&
    typeof globalStorage.setItem === "function" &&
    typeof globalStorage.removeItem === "function"
  ) {
    return;
  }

  const normalizedStorage: StorageLike = {
    getItem:
      typeof globalStorage.getItem === "function"
        ? globalStorage.getItem.bind(globalStorage)
        : () => null,
    setItem:
      typeof globalStorage.setItem === "function"
        ? globalStorage.setItem.bind(globalStorage)
        : () => {},
    removeItem:
      typeof globalStorage.removeItem === "function"
        ? globalStorage.removeItem.bind(globalStorage)
        : () => {},
    clear:
      typeof globalStorage.clear === "function"
        ? globalStorage.clear.bind(globalStorage)
        : () => {},
    key:
      typeof globalStorage.key === "function"
        ? globalStorage.key.bind(globalStorage)
        : () => null,
    length: typeof globalStorage.length === "number" ? globalStorage.length : 0,
  };

  try {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      enumerable: true,
      value: normalizedStorage,
      writable: true,
    });
  } catch {
    /* noop */
  }
}

normalizeGlobalLocalStorage();
