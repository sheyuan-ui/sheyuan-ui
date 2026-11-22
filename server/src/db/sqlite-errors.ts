export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes("FOREIGN KEY constraint failed");
}

export function isCheckViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes("CHECK constraint failed");
}