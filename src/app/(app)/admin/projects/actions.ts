"use server";

import { revalidatePath } from "next/cache";
import { actionUser, AuthError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { fieldErrors, projectInputSchema } from "@/lib/validation";

type Result = ActionResult<null>;

export async function saveProject(_prev: Result | null, fd: FormData): Promise<Result> {
  try {
    await actionUser({ manager: true });
    const parsed = projectInputSchema.safeParse({ name: fd.get("name"), color: fd.get("color") });
    if (!parsed.success) return { ok: false, error: "Please check the form.", fieldErrors: fieldErrors(parsed.error) };
    const id = fd.get("id");
    const supabase = await createClient();
    const { error } =
      typeof id === "string" && id
        ? await supabase.from("projects").update(parsed.data).eq("id", id)
        : await supabase.from("projects").insert(parsed.data);
    if (error) return { ok: false, error: error.code === "23505" ? "A project with that name already exists." : "Could not save the project." };
    revalidatePath("/admin/projects");
    return { ok: true, data: null, message: "Project saved." };
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? e.message : "Something went wrong." };
  }
}

export async function setProjectActive(_prev: Result | null, fd: FormData): Promise<Result> {
  try {
    await actionUser({ manager: true });
    const supabase = await createClient();
    const { error } = await supabase.from("projects").update({ is_active: fd.get("active") === "true" }).eq("id", String(fd.get("id")));
    if (error) return { ok: false, error: "Could not update the project." };
    revalidatePath("/admin/projects");
    return { ok: true, data: null, message: "Updated." };
  } catch (e) {
    return { ok: false, error: e instanceof AuthError ? e.message : "Something went wrong." };
  }
}
