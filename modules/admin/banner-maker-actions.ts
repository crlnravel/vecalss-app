"use server";

import { revalidatePath } from "next/cache";

import {
  type BannerMakerFormState,
  type BannerMakerDestinationFormState,
} from "@/lib/admin/banner-maker";
import { handleBannerMakerDestinationAction } from "@/lib/admin/banner-maker-action-handler";
import {
  assertLegacyBannerWritesRetired,
  isBannerV2EditorEnabled,
  LegacyBannerWritesRetiredError,
} from "@/lib/banner/activation";
import { getBannerDestination } from "@/lib/banner/destinations";
import {
  publishBannerMakerDestinationDesign,
  saveBannerMakerDestinationDraft,
} from "@/lib/admin/banner-maker-repository";
import { requireAdminSession } from "@/lib/auth/access";
import type { BannerMakerDestinationActionDependencies } from "@/lib/admin/banner-maker-action-handler";

async function updateBannerMakerDestinationAction(
  previousState: BannerMakerDestinationFormState,
  formData: FormData,
): Promise<BannerMakerDestinationFormState> {
  const dependencies: BannerMakerDestinationActionDependencies = {
    mutationsEnabled: isBannerV2EditorEnabled(),
    publish: publishBannerMakerDestinationDesign,
    requireAdminSession,
    saveDraft: saveBannerMakerDestinationDraft,
  };
  const result = await handleBannerMakerDestinationAction(previousState, formData, dependencies);
  if (result.status === "success") {
    revalidateBannerMakerPaths(result.destination, result.published === true);
  }
  return result;
}

function revalidateBannerMakerPaths(destination: BannerMakerDestinationFormState["destination"], published: boolean) {
  revalidatePath("/admin/student-banners");
  const route = getBannerDestination(destination)?.route;
  if (!route) return;
  const previewRoute = route === "/dashboard"
    ? "/admin/student-preview"
    : `/admin/student-preview${route}`;
  revalidatePath(previewRoute);
  if (published) revalidatePath(route);
}

async function updateBannerMakerAction(
  previousState: BannerMakerFormState,
  _formData: FormData,
): Promise<BannerMakerFormState> {
  void _formData;
  await requireAdminSession();
  try {
    assertLegacyBannerWritesRetired();
  } catch (error) {
    if (error instanceof LegacyBannerWritesRetiredError) {
      return {
        ...previousState,
        message: error.message,
        status: "error",
      };
    }
    throw error;
  }

  return {
    ...previousState,
    message: "Banner lama tidak tersedia.",
    status: "error",
  };
}

export {
  updateBannerMakerAction,
  updateBannerMakerDestinationAction,
};
