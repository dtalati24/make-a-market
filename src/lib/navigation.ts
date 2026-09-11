import { router } from 'expo-router';

/**
 * Back if there's somewhere to go back to; otherwise (e.g. a screen opened
 * straight from a reminder) fall back to the Markets tab.
 */
export function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
