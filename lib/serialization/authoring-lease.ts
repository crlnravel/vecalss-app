import "server-only";

import {
  assertEditLease,
  EditLeaseServiceError,
  withTransientEditLeases,
  type TransientEditLeaseInput,
} from "@/lib/resource-edit-lock/service";
import type { EditLeaseProof, EditLeaseResourceType } from "@/lib/resource-edit-lock/types";
import type { Prisma } from "@/generated/prisma/client";

/** The only proof material a repository/action may receive from an editor. */
type AuthoringEditLease = Pick<EditLeaseProof, "generation" | "token">;

type AuthoringLeaseResource = {
  resourceId: string;
  resourceType: EditLeaseResourceType;
};

async function assertAuthoringEditLease(
  tx: Prisma.TransactionClient,
  resource: AuthoringLeaseResource,
  holderUserId: string,
  editLease: AuthoringEditLease | null | undefined,
) {
  if (!editLease) {
    throw new EditLeaseServiceError("invalid_proof", 422, "Resource edit proof wajib dikirim.");
  }
  return assertEditLease(tx, {
    generation: editLease.generation,
    holderUserId,
    resourceId: resource.resourceId,
    resourceType: resource.resourceType,
    token: editLease.token,
  });
}

async function withTransientAuthoringEditLeases<T>(
  tx: Prisma.TransactionClient,
  resources: readonly AuthoringLeaseResource[],
  holderUserId: string,
  callback: (resources: readonly AuthoringLeaseResource[]) => Promise<T>,
) {
  const inputs = resources.map<TransientEditLeaseInput>((resource) => ({
    holderUserId,
    resourceId: resource.resourceId,
    resourceType: resource.resourceType,
  }));
  return withTransientEditLeases(tx, inputs, (claimed) => callback(claimed));
}

export {
  assertAuthoringEditLease,
  withTransientAuthoringEditLeases,
};

export type { AuthoringEditLease, AuthoringLeaseResource };
