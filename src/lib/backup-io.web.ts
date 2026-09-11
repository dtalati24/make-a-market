// Browser versions of the backup file helpers: a download link and a file input.
import { ValidationError } from '@/db/validation';

import { MAX_BACKUP_BYTES } from './backup-format';

/** Downloads the text as a file. */
export async function shareTextFile(fileName: string, contents: string, mimeType: string): Promise<void> {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Give the browser a moment to start the download before freeing the blob.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** Lets the user pick a file and returns its text, or null if they cancelled. */
export function pickTextFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(null);
      } else if (file.size > MAX_BACKUP_BYTES) {
        reject(new ValidationError('That file is too big to be a Make a Market backup.'));
      } else {
        file.text().then(resolve, reject);
      }
    });
    input.addEventListener('cancel', () => {
      input.remove();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}
