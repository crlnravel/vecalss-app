"use server";

import { revalidatePath } from "next/cache";
import { requireTutorSession } from "@/lib/auth/access";
import { duplicateTryout, saveTryout, TryoutValidationError, type SaveTryoutInput } from "@/lib/tryout/repository";

async function saveTryoutAction(input: SaveTryoutInput) { const session = await requireTutorSession(); try { const result = await saveTryout(input, session.user.id); revalidatePath("/mentor/tryout"); return { ok: true as const, result }; } catch (error) { return { ok: false as const, message: error instanceof TryoutValidationError ? error.message : "Tryout tidak dapat disimpan saat ini." }; } }
async function duplicateTryoutAction(id: string) { const session = await requireTutorSession(); try { const result = await duplicateTryout(id, session.user.id); revalidatePath("/mentor/tryout"); return { ok: true as const, result }; } catch (error) { return { ok: false as const, message: error instanceof TryoutValidationError ? error.message : "Tryout tidak dapat diduplikasi saat ini." }; } }
export { duplicateTryoutAction, saveTryoutAction };
