export function generateRandom6DigitId(): string {
  // Generates a random 6-digit numeric string (100000 - 999999)
  return Math.floor(100000 + Math.random() * 900000).toString();
}

