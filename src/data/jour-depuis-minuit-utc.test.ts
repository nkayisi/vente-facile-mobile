/**
 * Une colonne DATE tirée se lit comme le jour qu'elle désigne.
 *
 * Le tirage range « 2026-11-20 » en minuit UTC : lu en heure locale, il donnait
 * « 20 nov., 01:00 » à Kinshasa sur la fiche d'une dépense.
 */
import { coerce } from "@/sync/coerce";
import { dateDepuisJourISO, jourDepuisMinuitUTC } from "./dates";

describe("jourDepuisMinuitUTC", () => {
  it("rend le minuit LOCAL du jour rangé par le tirage", () => {
    const range = new Date(coerce("2026-11-20", "date") as number);
    const jour = jourDepuisMinuitUTC(range);
    expect(jour).toEqual(dateDepuisJourISO("2026-11-20"));
    expect([jour?.getFullYear(), jour?.getMonth(), jour?.getDate()]).toEqual([2026, 10, 20]);
    expect([jour?.getHours(), jour?.getMinutes()]).toEqual([0, 0]);
  });

  it("garde le jour au bord de l'année", () => {
    const range = new Date(coerce("2026-01-01", "date") as number);
    expect(jourDepuisMinuitUTC(range)?.getDate()).toBe(1);
    expect(jourDepuisMinuitUTC(range)?.getFullYear()).toBe(2026);
  });

  it("ne fabrique aucune date", () => {
    expect(jourDepuisMinuitUTC(null)).toBeNull();
    expect(jourDepuisMinuitUTC(undefined)).toBeNull();
    expect(jourDepuisMinuitUTC(new Date(Number.NaN))).toBeNull();
  });
});
