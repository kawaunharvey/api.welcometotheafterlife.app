/**
 * Permission utilities for checking access to fundraising resources
 */

import { ForbiddenException } from "@nestjs/common";
import { Memorial } from "@prisma/client";

/**
 * Assert that user is memorial owner or admin
 */
export function assertMemorialOwnerOrAdmin(
  userId: string,
  memorial: Memorial,
): void {
  const isOwner = memorial.ownerUserId === userId;
  const isAdmin = false; // TODO: Implement admin role check from JWT or user service

  if (!isOwner && !isAdmin) {
    throw new ForbiddenException(
      "Access denied. Must be memorial owner or admin.",
    );
  }
}

/**
 * Check if user is memorial owner or admin (without throwing)
 */
export function isMemorialOwnerOrAdmin(
  userId: string,
  memorial: Memorial,
): boolean {
  const isOwner = memorial.ownerUserId === userId;
  const isAdmin = false; // TODO: Implement admin role check from JWT or user service

  return isOwner || isAdmin;
}
