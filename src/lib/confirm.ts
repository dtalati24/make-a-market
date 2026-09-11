import { Alert } from 'react-native';

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
};

/** Native two-button confirmation; resolves true only if the user confirms. */
export function confirm({ title, message, confirmLabel, destructive }: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function showMessage(title: string, message?: string): void {
  Alert.alert(title, message);
}
