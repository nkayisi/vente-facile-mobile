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
import { useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { creerClient } from "@/features/clients/actes";
import {
  AppBar,
  Banner,
  Button,
  Card,
  Divider,
  FormField,
  Input,
  Screen,
  Segmented,
  Switch,
  Text,
  useToast,
} from "@/ui";

type TypeClient = "individual" | "business";

export default function NouveauClient() {
  const toast = useToast();

  const [type, setType] = useState<TypeClient>("individual");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [raisonSociale, setRaisonSociale] = useState("");
  const [numeroImpot, setNumeroImpot] = useState("");
  const [email, setEmail] = useState("");
  const [adresse, setAdresse] = useState("");
  const [notes, setNotes] = useState("");
  const [creditAutorise, setCreditAutorise] = useState(true);
  const [plafond, setPlafond] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const verrou = useRef(false);

  // Le serveur exige les deux : les laisser passer produirait un rejet
  // définitif, mis en quarantaine, alors que la saisie était sous la main.
  const nomManquant = nom.trim().length === 0;
  const telManquant = telephone.trim().length === 0;
  const bloque = envoi || nomManquant || telManquant;

  const valider = async () => {
    if (verrou.current || bloque) return;
    verrou.current = true;
    setEnvoi(true);

    try {
      const id = await creerClient({
        nom,
        telephone,
        entreprise: type === "business",
        raisonSociale,
        numeroImpot,
        email,
        adresse,
        notes,
        creditAutorise,
        plafondCredit: Number(plafond.replace(",", ".")) || 0,
      });
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
      <AppBar title="Nouveau client" />

      <View className="gap-4 p-4">
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

          {type === "business" ? (
            <>
              <FormField label="Raison sociale">
                <Input value={raisonSociale} onChangeText={setRaisonSociale} />
              </FormField>
              <FormField label="Numéro d'impôt">
                <Input value={numeroImpot} onChangeText={setNumeroImpot} />
              </FormField>
            </>
          ) : null}

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
            hint="0 signifie « sans plafond », pas « crédit refusé »."
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

        <Banner
          tone="info"
          title="Le code est attribué par le serveur"
          message="Il est unique dans l'établissement. Vous pouvez déjà vendre à ce client : la vente et sa création partiront ensemble."
        />

        <Button fullWidth size="lg" disabled={bloque} onPress={() => void valider()}>
          {envoi ? "Enregistrement…" : "Créer le client"}
        </Button>
      </View>
    </Screen>
  );
}
