import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { ValidationError } from '@/db/validation';

import { MAX_BACKUP_BYTES } from './backup-format';

/** Writes the text to a file in the cache directory and opens the Android share sheet for it. */
export async function shareTextFile(fileName: string, contents: string, mimeType: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new ValidationError('Sharing isn’t available on this device.');
  }
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(contents);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
}

/** Lets the user pick a file and returns its text, or null if they cancelled. */
export async function pickTextFile(): Promise<string | null> {
  // Saved JSON files often have a generic MIME type on Android (text/plain or
  // application/octet-stream), so accept anything and validate the contents.
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  if (asset.size !== undefined && asset.size > MAX_BACKUP_BYTES) {
    throw new ValidationError('That file is too big to be a Make a Market backup.');
  }
  const file = new File(asset.uri);
  try {
    return await file.text();
  } finally {
    try {
      // The picker copied the file into the cache; tidy it up.
      if (file.exists) file.delete();
    } catch {
      // Not worth failing the import over.
    }
  }
}
