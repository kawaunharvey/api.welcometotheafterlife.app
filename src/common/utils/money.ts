/**
 * Money utilities for handling cents-based calculations
 * All monetary values must be stored and handled as integers (cents)
 */

import { BadRequestException } from "@nestjs/common";

/**
 * Assert that a value is a valid cents amount
 */
export function assertCents(value: number): void {
  if (!Number.isInteger(value)) {
    throw new BadRequestException(
      `Amount must be an integer (cents), got: ${value}`,
    );
  }

  if (value < 0) {
    throw new BadRequestException(`Amount must be non-negative, got: ${value}`);
  }
}

/**
 * Assert that a value is a valid positive cents amount
 */
export function assertPositiveCents(value: number): void {
  assertCents(value);

  if (value <= 0) {
    throw new BadRequestException(
      `Amount must be greater than 0, got: ${value}`,
    );
  }
}

/**
 * Sum an array of cents values safely
 */
export function sumCents(values: number[]): number {
  return values.reduce((sum, value) => {
    assertCents(value);
    return sum + value;
  }, 0);
}

/**
 * Calculate available amount for payout
 * availableForPayoutCents = currentAmountCents - totalPayoutsCents
 */
export function calculateAvailableForPayout(
  currentAmountCents: number,
  totalPayoutsCents: number,
): number {
  assertCents(currentAmountCents);
  assertCents(totalPayoutsCents);

  return Math.max(0, currentAmountCents - totalPayoutsCents);
}

/**
 * Validate currency code
 */
export function validateCurrency(currency: string): void {
  const validCurrencies = ["USD"]; // Add more as needed

  if (!validCurrencies.includes(currency)) {
    throw new BadRequestException(
      `Unsupported currency: ${currency}. Supported: ${validCurrencies.join(", ")}`,
    );
  }
}

/**
 * Format cents as dollars for display purposes (not for storage)
 */
export function formatCentsAsDollars(cents: number): string {
  assertCents(cents);
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Convert dollars to cents (for user input processing only)
 * NOTE: Only use this for processing user input, never for storage
 */
export function dollarsTocents(dollars: number): number {
  const cents = Math.round(dollars * 100);
  assertCents(cents);
  return cents;
}
