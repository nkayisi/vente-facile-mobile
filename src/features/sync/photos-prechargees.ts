/**
 * Les photos d'articles, téléchargées d'avance après chaque synchronisation.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ UNE PHOTO JAMAIS AFFICHÉE NE S'AFFICHAIT PAS HORS LIGNE.                │
 * │                                                                          │
 * │ `expo-image` garde sur le disque ce qu'il a montré, rien de plus : un    │
 * │ terminal synchronisé le matin puis privé de réseau au comptoir montrait  │
 * │ des icônes de colis à la place de la moitié de son catalogue. Décision   │
 * │ du 2026-11-25 : on télécharge toutes les photos après chaque             │
 * │ synchronisation complète, QUEL QUE SOIT LE RÉSEAU.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ JAMAIS BLOQUANT, JAMAIS SOUS LE VERROU DE SYNCHRONISATION, JAMAIS BAVARD :
 * une photo est un confort, une vente est l'essentiel. On rend la main tout de
 * suite, on télécharge par petits lots, et un échec ne se dit nulle part (la
 * prochaine synchronisation réessaiera).
 *
 * ⚠ Ce qui a réussi pendant ce lancement n'est pas redemandé : sans cette
 * mémoire, chaque vente (qui relance un cycle) redemanderait tout le catalogue.
 */
import { Image } from "expo-image";
import { and, eq, isNotNull, isNull, or } from "drizzle-orm";

import { db } from "@/db/client";
import { products } from "@/db/schema";

import { parLots, photosAPrecharger } from "./photos-a-precharger";

/** Téléchargements simultanés : assez pour avancer, trop peu pour saturer une 2G. */
const SIMULTANES = 4;

const prechargees = new Set<string>();
let enCours = false;

export function prechargerPhotos(): void {
  if (enCours) return;
  enCours = true;
  void (async () => {
    try {
      const lignes = await db
        .selectDistinct({ image: products.image })
        .from(products)
        .where(
          and(
            isNotNull(products.image),
            or(eq(products.isDeleted, false), isNull(products.isDeleted))
          )
        );
      const aFaire = photosAPrecharger(
        lignes.map((l) => l.image),
        prechargees
      );
      for (const lot of parLots(aFaire, SIMULTANES)) {
        await Promise.all(
          lot.map(async (url) => {
            try {
              if (await Image.prefetch(url, { cachePolicy: "disk" })) prechargees.add(url);
            } catch {
              // Injoignable : la prochaine synchronisation réessaiera.
            }
          })
        );
      }
    } catch {
      // Base indisponible (déconnexion en cours) : rien à faire.
    } finally {
      enCours = false;
    }
  })();
}
