"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/src/lib/auth";
import { getDictionary } from "@/src/lib/i18n";
import { prisma } from "@/src/lib/prisma";

const responsibleSchema = z.object({
  firstName: z.string().trim().min(2),
  lastName: z.string().trim().min(2),
  email: z.union([z.literal(""), z.string().trim().email()]),
  phone: z.string().trim()
});

export type CreateResponsibleState = {
  error?: string;
  values?: { firstName: string; lastName: string; email: string; phone: string };
};

export async function createResponsibleAction(_state: CreateResponsibleState, formData: FormData): Promise<CreateResponsibleState> {
  const actor = await getCurrentUser();
  if (!actor?.roles.some((role) => role.role === "admin")) {
    throw new Error("Only an administrator can create responsible profiles.");
  }

  const { t } = await getDictionary();
  const values = {
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    phone: String(formData.get("phone") ?? "")
  };
  const parsed = responsibleSchema.safeParse(values);
  if (!parsed.success) return { error: t.responsibleInvalid, values };

  if (parsed.data.email) {
    const [account, profile] = await Promise.all([
      prisma.user.findUnique({ where: { email: parsed.data.email } }),
      prisma.player.findFirst({ where: { contactEmail: { equals: parsed.data.email, mode: "insensitive" }, mergedIntoPlayerId: null } })
    ]);
    if (account || profile) return { error: t.registrationEmailExists, values };
  }

  await prisma.player.create({
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      contactEmail: parsed.data.email || null,
      contactPhone: parsed.data.phone || null,
      isSportsProfile: false,
      showContactPublic: false,
      showPhysicalPublic: false
    }
  });

  redirect("/admin/players?created=responsible");
}

export async function updateResponsibleAction(formData: FormData) {
  const actor = await getCurrentUser();
  const id = z.string().uuid().parse(formData.get("playerId"));
  const existing = await prisma.player.findUniqueOrThrow({ where: { id } });
  if (!actor || !(actor.roles.some((role) => role.role === "admin") || existing.userId === actor.id)) {
    throw new Error("You cannot edit this profile.");
  }
  const values = responsibleSchema.parse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    phone: formData.get("phone")
  });
  if (existing.isSportsProfile) throw new Error("This is a sports profile.");
  if (values.email) {
    const account = await prisma.user.findUnique({ where: { email: values.email }, select: { id: true } });
    if (account && account.id !== existing.userId) redirect(`/players/${id}/edit?error=duplicate_email`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id },
      data: {
        firstName: values.firstName,
        lastName: values.lastName,
        contactEmail: values.email || null,
        contactPhone: values.phone || null
      }
    });
    if (existing.userId) {
      await tx.user.update({
        where: { id: existing.userId },
        data: { displayName: `${values.firstName} ${values.lastName}`, phone: values.phone || null }
      });
    }
  });
  revalidatePath("/admin/players");
  revalidatePath(`/players/${id}`);
  if (actor.roles.some((role) => role.role === "admin")) redirect("/admin/players?updated=responsible");
  redirect(`/players/${id}?saved=1`);
}

export async function enableSportsProfileAction(formData: FormData) {
  const actor = await getCurrentUser();
  if (!actor?.roles.some((role) => role.role === "admin")) {
    throw new Error("Only an administrator can enable a sports profile.");
  }
  const id = z.string().uuid().parse(formData.get("playerId"));
  const person = await prisma.player.findUniqueOrThrow({ where: { id } });
  if (person.isSportsProfile) redirect(`/players/${id}/edit`);
  await prisma.player.update({ where: { id }, data: { isSportsProfile: true } });
  revalidatePath("/admin/players");
  revalidatePath(`/players/${id}`);
  redirect(`/players/${id}/edit?converted=1`);
}
