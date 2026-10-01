/**
 * Pipe an initial value through transform functions (left-to-right).
 */
export function compose<T>(
  initial: T,
  ...transforms: Array<(value: T) => T>
): T {
  return transforms.reduce((acc, fn) => fn(acc), initial);
}
