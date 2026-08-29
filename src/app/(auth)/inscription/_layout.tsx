/**
 * Assistant d'inscription : deux étapes, un seul état.
 *
 * La saisie vit ICI et non dans les paramètres de route : un mot de passe n'a
 * rien à faire dans une URL, fût-elle interne.
 *
 * **Créer un établissement est un acte EN LIGNE, sans exception.** Le serveur
 * lui attribue son identifiant, son slug unique et le code de ce terminal ; et
 * `Device.organization` est une clé étrangère non nulle, donc l'enrôlement ne
 * peut pas être différé. D'où le seul écran bloquant de l'application, qui dit
 * pourquoi il bloque et se lève seul quand le réseau revient.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Stack, router } from "expo-router";
import NetInfo from "@react-native-community/netinfo";

import type { SaisieCompte, TypeEtablissement } from "@/session/session";
import { HorsLigneBloquant, Screen } from "@/ui";

export interface SaisieInscription extends SaisieCompte {
  organization_name: string;
  organization_phone: string;
  business_type: TypeEtablissement;
  currency: string;
}

const VIDE: SaisieInscription = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  password: "",
  password_confirm: "",
  organization_name: "",
  organization_phone: "",
  business_type: "boutique",
  currency: "CDF",
};

interface Contexte {
  saisie: SaisieInscription;
  poser: (champs: Partial<SaisieInscription>) => void;
}

const Ctx = createContext<Contexte | null>(null);

export function useInscription(): Contexte {
  const c = useContext(Ctx);
  if (!c) throw new Error("useInscription doit être appelé sous l'assistant d'inscription.");
  return c;
}

export default function InscriptionLayout() {
  const [saisie, setSaisie] = useState<SaisieInscription>(VIDE);
  const [enLigne, setEnLigne] = useState<boolean | null>(null);

  useEffect(() => {
    const abo = NetInfo.addEventListener((e) => {
      // `isInternetReachable` vaut `null` tant que la sonde n'a pas conclu : on
      // ne bloque pas sur un état encore indéterminé, ce serait un faux positif
      // à chaque démarrage.
      setEnLigne(e.isConnected === false ? false : true);
    });
    return () => abo();
  }, []);

  const valeur = useMemo<Contexte>(
    () => ({ saisie, poser: (c) => setSaisie((s) => ({ ...s, ...c })) }),
    [saisie]
  );

  if (enLigne === false) {
    return (
      <Screen>
        <HorsLigneBloquant
          titre="Créer une boutique demande une connexion"
          message="L'établissement est créé sur nos serveurs, qui lui attribuent son identifiant et le code de ce terminal. Reconnectez-vous à Internet pour continuer."
          actionSecondaire={{
            label: "J'ai déjà un compte",
            onPress: () => router.replace("/(auth)/login"),
          }}
        />
      </Screen>
    );
  }

  return (
    <Ctx.Provider value={valeur}>
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />
    </Ctx.Provider>
  );
}
