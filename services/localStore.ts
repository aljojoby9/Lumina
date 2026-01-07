
const DB_NAME = 'LuminaLocalStore';
const STORE_NAME = 'projectMedia';
const DB_VERSION = 1;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

export const saveFileToLocal = async (key: string, file: File): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Store the file with its metadata
    const request = store.put(file, key);

    request.onsuccess = () => {
      console.log(`File saved to IndexedDB: ${key} (${file.name}, ${(file.size / 1024 / 1024).toFixed(2)} MB)`);
      resolve();
    };

    request.onerror = () => {
      console.error(`Failed to save file to IndexedDB: ${key}`, request.error);
      reject(request.error);
    };

    transaction.onerror = () => {
      console.error(`Transaction failed for file: ${key}`, transaction.error);
      reject(transaction.error);
    };
  });
};

export const getFileFromLocal = async (key: string): Promise<File | undefined> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        if (request.result) {
          console.log(`File retrieved from IndexedDB: ${key}`);
          resolve(request.result);
        } else {
          console.warn(`File not found in IndexedDB: ${key}`);
          resolve(undefined);
        }
      };

      request.onerror = () => {
        console.error(`Failed to retrieve file from IndexedDB: ${key}`, request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.error(`IndexedDB error while getting file: ${key}`, err);
    return undefined;
  }
};

export const deleteFileFromLocal = async (key: string): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Legacy support wrappers if needed, or specific cleanup helpers
export const saveVideoToLocal = saveFileToLocal;
export const getVideoFromLocal = getFileFromLocal;
export const deleteVideoFromLocal = deleteFileFromLocal;
