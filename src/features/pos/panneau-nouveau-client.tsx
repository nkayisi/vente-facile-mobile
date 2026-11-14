/**
 * Créer un client SANS QUITTER l'encaissement.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LE CLIENT EST DEVANT LE COMPTOIR, ET LA VENTE EST DÉJÀ AU PANIER.       │
 * │                                                                          │
 * │ Sans ce panneau, inscrire un nouveau client demandait de fermer la       │
 * │ feuille, d'aller dans « Clients », de remplir le formulaire, puis de     │
 * │ revenir au comptoir - où le client restait introuvable tant qu'il        │
 * │ n'était pas synchronisé. Le back-office, lui, le crée depuis sa caisse   │
 * │ (« Créer et sélectionner ») : c'est ce geste que le terminal reprend.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Les champs sont ceux du back-office : type, nom et téléphone obligatoires,
 * e-mail et adresse, et pour une entreprise la raison sociale et le numéro
 * d'impôt. Les conditions de crédit restent celles du serveur par défaut
 * (crédit autorisé, sans plafond), comme au back-office ; elles se règlent
 * ensuite depuis la fiche du client.
 *
 * ⚠ LA CRÉATION PASSE PAR LE JOURNAL, comme le formulaire « Nouveau client » :
 * elle marche hors ligne, et la vente faite à ce client DÉPEND de sa création
 * (`dependancesDuClient`), pour partir avec elle et jamais avant.
 *
 * ⚠ CE PANNEAU VIT DANS LA FEUILLE D'ENCAISSEMENT, il n'en ouvre pas une autre :
 * `Sheet` est un `Modal`, et on n'en empile pas deux.
 */
import { useRef, useState } from "react";
import { View } from "react-native";

import { creerClient } from "@/features/clients/actes";
import type { TypeClient } from "@/features/clients/edition-client";
import { Banner, Button, FormField, Input, Segmented } from "@/ui";

import { clientPosDepuisCreation, preremplissage } from "./clients-en-file";
import type { ClientPos } from "./etat-panier";

export function PanneauNouveauClient({
  recherche,
  onCree,
  onErreur,
}: {
  /** Le terme cherché sans succès, repris dans le formulaire. */
  recherche: string;
  /** Le client créé, à rattacher aussitôt à la vente. */
  onCree: (client: ClientPos) => void;
  onErreur: (message: string) => void;
}) {
  const depart = preremplissage(recherche);
  const [type, setType] = useState<TypeClient>("individual");
  const [nom, setNom] = useState(depart.nom);
  const [telephone, setTelephone] = useState(depart.telephone);
  const [raisonSociale, setRaisonSociale] = useState("");
  const [numeroImpot, setNumeroImpot] = useState("");
  const [email, setEmail] = useState("");
  const [adresse, setAdresse] = useState("");
  const [envoi, setEnvoi] = useState(false);
  // Verrou SYNCHRONE : un double appui créerait deux clients.
  const verrou = useRef(false);

  const entreprise = type === "business";
  const nomManquant = nom.trim().length === 0;
  const telManquant = telephone.trim().length === 0;
  const bloque = envoi || nomManquant || telManquant;

  const creer = async () => {
    if (verrou.current || bloque) return;
    verrou.current = true;
    setEnvoi(true);
    try {
      const id = await creerClient({
        nom,
        telephone,
        entreprise,
        raisonSociale,
        numeroImpot,
        email,
        adresse,
        // Les défauts du serveur, comme au back-office : crédit autorisé,
        // sans plafond. Ils se règlent ensuite depuis la fiche du client.
        creditAutorise: true,
        plafondCredit: 0,
      });
      onCree(
        clientPosDepuisCreation({
          id,
          name: nom,
          phone: telephone,
          allow_credit: true,
          credit_limit: "0",
        })
      );
    } catch (e) {
      onErreur(e instanceof Error ? e.message : "Le client n'a pas pu être enregistré.");
    } finally {
      setEnvoi(false);
      verrou.current = false;
    }
  };

  return (
    <View className="gap-4">
      <FormField label="Type de client">
        <Segmented
          options={[
            { valeur: "individual", label: "Particulier", icon: "User" },
            { valeur: "business", label: "Entreprise", icon: "Building2" },
          ]}
          valeur={type}
          onChange={(v) => setType(v as TypeClient)}
        />
      </FormField>

      <FormField label={entreprise ? "Nom de l'entreprise" : "Nom complet"} required>
        <Input
          value={nom}
          onChangeText={setNom}
          placeholder={entreprise ? "Ex. : Congo Tech SARL" : "Ex. : Jean Mukendi"}
          autoCapitalize="words"
        />
      </FormField>

      {entreprise ? (
        <FormField label="Raison sociale">
          <Input
            value={raisonSociale}
            onChangeText={setRaisonSociale}
            placeholder="Raison sociale complète"
          />
        </FormField>
      ) : null}

      <FormField label="Téléphone" required>
        <Input
          value={telephone}
          onChangeText={setTelephone}
          keyboardType="phone-pad"
          placeholder="0900000000"
        />
      </FormField>

      <FormField label="E-mail">
        <Input
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="client@exemple.com"
        />
      </FormField>

      <FormField label="Adresse">
        <Input value={adresse} onChangeText={setAdresse} placeholder="Avenue, numéro, quartier" />
      </FormField>

      {entreprise ? (
        <FormField label="N° impôt / RCCM">
          <Input value={numeroImpot} onChangeText={setNumeroImpot} placeholder="NIF ou RCCM" />
        </FormField>
      ) : null}

      <Banner
        tone="info"
        title="Le client part avec la vente"
        message="Il est créé sur ce terminal et partira à la prochaine synchronisation, avant la vente faite à son nom."
      />

      <Button fullWidth leftIcon="UserPlus" loading={envoi} disabled={bloque} onPress={creer}>
        Créer et sélectionner
      </Button>
    </View>
  );
}
