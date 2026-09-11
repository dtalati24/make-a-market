import { ValidationError } from '@/db/validation';

/** A message that's safe to show the user; unexpected errors are logged. */
export function errorMessage(error: unknown): string {
  if (error instanceof ValidationError) return error.message;
  console.error(error);
  return 'Something went wrong. Please try again.';
}
