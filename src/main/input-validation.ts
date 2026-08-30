const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function validateUuid(value: unknown, label = 'ID'): string {
  if (!isUuid(value)) throw new Error(`${label} 형식이 올바르지 않습니다.`);
  return value;
}

export function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} 값이 올바르지 않습니다.`);
  }
  return value;
}
