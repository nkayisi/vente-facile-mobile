import { parLots, photosAPrecharger } from "./photos-a-precharger";

describe("photosAPrecharger", () => {
  it("garde les adresses distantes, une fois chacune", () => {
    expect(
      photosAPrecharger(
        ["https://vf.test/media/a.jpg", "https://vf.test/media/a.jpg", "http://10.0.2.2:8005/media/b.png"],
        new Set()
      )
    ).toEqual(["https://vf.test/media/a.jpg", "http://10.0.2.2:8005/media/b.png"]);
  });

  it("écarte le vide, le local, et ce qui est déjà chargé", () => {
    expect(
      photosAPrecharger(
        [null, undefined, "", "  ", "file:///data/photos/x.jpg", "https://vf.test/media/c.jpg"],
        new Set(["https://vf.test/media/c.jpg"])
      )
    ).toEqual([]);
  });
});

describe("parLots", () => {
  it("découpe sans rien perdre", () => {
    expect(parLots([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(parLots([], 4)).toEqual([]);
  });
});
