/**
 * Créer un client. Miroir du formulaire de `contacts/customers/page.tsx`.
 *
 * **Le CODE n'est pas saisi ici, et ce n'est pas un oubli.** Il est unique par
 * organisation et le serveur seul peut le garantir : deux terminaux hors ligne
 * fabriqueraient fatalement le même. L'IDENTIFIANT, lui, est tiré ici, pour
 * qu'une vente à crédit encaissée dans la foulée puisse désigner ce client
 * avant que le serveur ne l'ait vu.
 *
 * **`allow_credit` et `credit_limit` sont deux réglages DISTINCTS**, et l'écran
 * refuse de les confondre : un plafond à 0 signifie « sans plafond », jamais
 * « crédit refusé ». C'est le piège que le back-office documente dans sa propre
 * modale, et qui vaut ici mot pour mot.
 */
import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { creerClient, modifierClient } from "@/features/clients/actes";
import { clientAEditer } from "@/data/contact-detail";
import {
  lirePlafond,
  valeursDepuisCorpsClient,
  type TypeClient,
  type ValeursClient,
} from "@/features/clients/edition-client";
import { useLecture } from "@/data/live";
import { BandeauEnvoi } from "@/features/sync/bandeau-envoi";
import type { EtatEnvoi } from "@/sync";
import {
  AppBar,
  Banner,
  Button,
  Card,
  Divider,
  EmptyState,
  FormField,
  Input,
  RangeeChamps,
  Screen,
  Segmented,
  Spinner,
  Switch,
  Text,
  useToast,
} from "@/ui";

/**
 * Créer OU modifier un client (lot L12) : le même formulaire, monté une fois
 * ses valeurs lues - voir l'écran d'article, qui suit le même motif.
 */
export default function EcranClient() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  if (!id) return <FormulaireClient />;
  return <ModificationClient id={id} />;
}

function ModificationClient({ id }: { id: string }) {
  const charger = useCallback(() => clientAEditer(id), [id]);
  const { donnees, chargement } = useLecture(charger, { tables: ["customers"], deps: [id] });
  if (chargement && !donnees) {
    return (
      <Screen>
        <AppBar title="Modifier le client" />
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
      </Screen>
    );
  }
  if (!donnees) {
    return (
      <Screen padded={false}>
        <AppBar title="Modifier le client" />
        <EmptyState
          icon="User"
          title="Client introuvable"
          message="Il n'est ni sur ce terminal, ni dans le journal d'envoi."
          action={{ label: "Retour", onPress: () => router.back() }}
        />
      </Screen>
    );
  }
  return (
    <FormulaireClient
      key={id}
      fiche={id}
      initial={valeursDepuisCorpsClient(donnees.corps)}
      creationEnFile={donnees.creationEnFile}
      envoiModification={donnees.envoiModification}
    />
  );
}

function FormulaireClient({
  fiche,
  initial,
  creationEnFile = null,
  envoiModification,
}: {
  fiche?: string;
  initial?: ValeursClient;
  creationEnFile?: string | null;
  envoiModification?: EtatEnvoi;
} = {}) {
  const toast = useToast();
  const enModification = !!fiche;

  const [type, setType] = useState<TypeClient>(initial?.type ?? "individual");
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [telephone, setTelephone] = useState(initial?.telephone ?? "");
  const [raisonSociale, setRaisonSociale] = useState(initial?.raisonSociale ?? "");
  const [numeroImpot, setNumeroImpot] = useState(initial?.numeroImpot ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [adresse, setAdresse] = useState(initial?.adresse ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [creditAutorise, setCreditAutorise] = useState(initial?.creditAutorise ?? true);
  const [plafond, setPlafond] = useState(initial?.plafond ?? "");
  const [envoi, setEnvoi] = useState(false);
  const verrou = useRef(false);

  // Le serveur exige les deux : les laisser passer produirait un rejet
  // définitif, mis en quarantaine, alors que la saisie était sous la main.
  const nomManquant = nom.trim().length === 0;
  const telManquant = telephone.trim().length === 0;
  const plafondLu = lirePlafond(plafond);
  const refusPlafond = plafondLu.ok
    ? undefined
    : plafondLu.motif === "negatif"
      ? "Un plafond ne peut pas être négatif."
      : "Ce montant n'est pas lisible.";
  const bloque = envoi || nomManquant || telManquant || !plafondLu.ok;

  const valider = async () => {
    if (verrou.current || bloque || !plafondLu.ok) return;
    verrou.current = true;
    setEnvoi(true);

    const saisie = {
      nom,
      telephone,
      entreprise: type === "business",
      raisonSociale,
      numeroImpot,
      email,
      adresse,
      notes,
      creditAutorise,
      plafondCredit: plafondLu.valeur,
    };
    try {
      if (fiche) {
        // ⚠ Un client encore EN FILE attend sa création, sinon la modification
        //   part sur une fiche introuvable et finit en quarantaine.
        await modifierClient(fiche, saisie, {
          dependDe: creationEnFile ? [creationEnFile] : undefined,
        });
        toast.succes("Modification enregistrée. Elle partira à la prochaine synchronisation.");
        router.back();
        return;
      }
      const id = await creerClient(saisie);
      toast.succes("Client créé. Il partira à la prochaine synchronisation.");
      // `replace` et non `push` : revenir en arrière ne doit pas ramener un
      // formulaire déjà validé, dont un second envoi créerait un doublon.
      router.replace(`/client/${id}`);
    } catch (e) {
      toast.erreur(
        e instanceof Error ? e.message : "Le client n'a pas pu être enregistré."
      );
    } finally {
      setEnvoi(false);
      verrou.current = false;
    }
  };

  return (
    <Screen scroll padded={false}>
      <AppBar title={enModification ? "Modifier le client" : "Nouveau client"} />

      <View className="gap-4 p-4">
        {enModification ? (
          <BandeauEnvoi
            envoi={envoiModification}
            titre="Une modification attend déjà son envoi"
            consequence="Le formulaire part de ce que vous aviez saisi. Le comptoir appliquera le nouveau plafond après l'envoi."
          />
        ) : null}
        <Card>
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

          <RangeeChamps>
            <FormField
              label={type === "business" ? "Nom de l'entreprise" : "Nom complet"}
              required
              error={nom.length > 0 && nomManquant ? "Le nom est obligatoire." : undefined}
            >
              <Input
                value={nom}
                onChangeText={setNom}
                placeholder={type === "business" ? "Ets Kalume & Fils" : "Jean Mukendi"}
                autoFocus
              />
            </FormField>

            <FormField label="Téléphone" required>
              <Input
                value={telephone}
                onChangeText={setTelephone}
                keyboardType="phone-pad"
                placeholder="0900000000"
              />
            </FormField>
          </RangeeChamps>

          {type === "business" ? (
            <RangeeChamps>
              <FormField label="Raison sociale">
                <Input value={raisonSociale} onChangeText={setRaisonSociale} />
              </FormField>
              <FormField label="Numéro d'impôt">
                <Input value={numeroImpot} onChangeText={setNumeroImpot} />
              </FormField>
            </RangeeChamps>
          ) : null}

          <RangeeChamps>
            <FormField label="E-mail">
              <Input
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </FormField>

            <FormField label="Adresse">
              <Input value={adresse} onChangeText={setAdresse} />
            </FormField>
          </RangeeChamps>

          <FormField label="Notes">
            <Input value={notes} onChangeText={setNotes} />
          </FormField>
        </Card>

        <Card>
          <Text variant="label" className="mb-3 uppercase tracking-wide text-muted-foreground">
            Conditions de crédit
          </Text>

          <View className="flex-row items-start justify-between gap-4">
            <View className="min-w-0 flex-1">
              <Text variant="bodySmall" className="font-sans-medium">
                Autoriser les achats à crédit
              </Text>
              <Text variant="caption" className="mt-0.5">
                Désactivé, ce client doit régler intégralement chaque vente :
                aucune facture ne peut rester ouverte à son nom.
              </Text>
            </View>
            <Switch valeur={creditAutorise} onChange={setCreditAutorise} />
          </View>

          <View className="my-3">
            <Divider />
          </View>

          <FormField
            label="Montant maximum autorisé à crédit"
            hint="Vide ou 0 signifie « sans plafond », pas « crédit refusé »."
            error={refusPlafond}
          >
            <Input
              value={plafond}
              onChangeText={setPlafond}
              keyboardType="decimal-pad"
              placeholder="0"
              editable={creditAutorise}
            />
          </FormField>
        </Card>

        {enModification ? null : (
          <Banner
            tone="info"
            title="Le code est attribué par le serveur"
            message="Il est unique dans l'établissement. Vous pouvez déjà vendre à ce client : la vente et sa création partiront ensemble."
          />
        )}

        <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
          {envoi ? "Enregistrement…" : enModification ? "Enregistrer les modifications" : "Créer le client"}
        </Button>
      </View>
    </Screen>
  );
}
