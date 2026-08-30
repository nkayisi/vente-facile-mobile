/**
 * Utilisateurs, rôles et appareils.
 * Miroir de `app/dashboard/users/` et de la section « Appareils ».
 *
 * **Les utilisateurs sont enfin NOMMÉS.** Jusqu'au lot 10, `users` n'était pas
 * au manifeste et l'écran ne pouvait afficher qu'un décompte : `memberships` ne
 * porte que `user_id`, le rôle et les permissions. La table descend désormais,
 * BORNÉE PAR APPARTENANCE et amputée de tout ce qui ne doit pas quitter le
 * serveur - ni mot de passe, ni drapeau de super-utilisateur.
 */
import { desc, eq } from "drizzle-orm";
import { ROLE_LABELS, type Role } from "@vente-facile/core";

import { db } from "@/db/client";
import { devices, memberships, users } from "@/db/schema";

export interface Membre {
  id: string;
  userId: string;
  nom: string;
  email: string;
  telephone: string | null;
  role: Role;
  roleLabel: string;
  actif: boolean;
  /** Permissions accordées EN PLUS de celles du rôle. */
  permissionsSupplementaires: string[];
  /** Entrepôts auxquels le membre est cantonné. Vide = tous. */
  entrepots: number;
}

export async function listeMembres(): Promise<Membre[]> {
  const lignes = await db
    .select({
      id: memberships.id,
      userId: memberships.userId,
      role: memberships.role,
      actif: memberships.isActive,
      permissions: memberships.extraPermissions,
      prenom: users.firstName,
      nom: users.lastName,
      email: users.email,
      telephone: users.phone,
      compteActif: users.isActive,
    })
    .from(memberships)
    .leftJoin(users, eq(users.id, memberships.userId))
    .orderBy(memberships.role);

  return lignes.map((m) => {
    const complet = [m.prenom, m.nom].filter(Boolean).join(" ").trim();
    let supplementaires: string[] = [];
    try {
      const brut = m.permissions ? JSON.parse(m.permissions) : [];
      if (Array.isArray(brut)) supplementaires = brut.map(String);
    } catch {
      // Une valeur illisible ne doit pas faire tomber l'écran : on affiche
      // simplement qu'il n'y a pas de permission supplémentaire connue.
      supplementaires = [];
    }
    return {
      id: m.id,
      userId: m.userId,
      // `null` ne se lit pas comme « sans nom » : un compte pas encore tiré
      // porte son e-mail, qui est toujours là.
      nom: complet || m.email || "Utilisateur",
      email: m.email ?? "",
      telephone: m.telephone?.trim() || null,
      role: m.role as Role,
      roleLabel: ROLE_LABELS[m.role as Role] ?? m.role,
      actif: Boolean(m.actif) && Boolean(m.compteActif ?? true),
      permissionsSupplementaires: supplementaires,
      entrepots: 0,
    };
  });
}

export interface Appareil {
  id: string;
  nom: string;
  code: string;
  plateforme: string;
  modele: string | null;
  versionApp: string | null;
  vuLe: Date | null;
  expireLe: Date | null;
  revoqueLe: Date | null;
  /** Vrai pour LE terminal courant : on ne révoque pas celui qu'on tient. */
  courant: boolean;
}

export async function listeAppareils(codeCourant: string | null): Promise<Appareil[]> {
  const lignes = await db.select().from(devices).orderBy(desc(devices.lastSeenAt));
  return lignes.map((d) => ({
    id: d.id,
    nom: d.name,
    code: d.deviceCode,
    plateforme: d.platform,
    modele: d.model?.trim() || null,
    versionApp: d.appVersion?.trim() || null,
    vuLe: d.lastSeenAt ?? null,
    expireLe: d.expiresAt ?? null,
    revoqueLe: d.revokedAt ?? null,
    courant: codeCourant != null && d.deviceCode === codeCourant,
  }));
}
