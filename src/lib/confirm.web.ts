// react-native-web's Alert is a no-op, so fall back to the browser dialogs.
import type { ConfirmOptions } from './confirm';

export type { ConfirmOptions } from './confirm';

export function confirm({ title, message }: ConfirmOptions): Promise<boolean> {
  return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
}

export function showMessage(title: string, message?: string): void {
  window.alert(message ? `${title}\n\n${message}` : title);
}
