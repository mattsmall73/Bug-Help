// The structure the filer files into, held as config rather than baked into the
// prompt. Politics is the first and only subject now. Sociology becomes a second
// SubjectStructure later as pure data, not a rebuild — the engine and the prompt
// read whatever config they are handed.

export type CountryId = "UK" | "USA" | "comparative" | "ideas";

export type Drawer = {
  id: number; // 1-5
  name: string; // plain-English label
  blurb: string; // what lives in this drawer, in plain words
};

export type IdeaStrand = {
  id: string;
  name: string;
};

export type SubjectStructure = {
  id: string; // "politics"
  subject: string; // exam-board + subject, for the prompt header
  level: string;
  // The countries a filed item can resolve to. "comparative" and "ideas" are
  // special: comparative is a UK-vs-US point that still has a drawer; ideas is
  // an ideology point with no drawer.
  countries: { id: CountryId; label: string }[];
  drawers: Drawer[];
  ideas: {
    label: string;
    strands: IdeaStrand[];
  };
};

export const POLITICS: SubjectStructure = {
  id: "politics",
  subject: "AQA A-level Politics",
  level: "A-level",
  countries: [
    { id: "UK", label: "UK" },
    { id: "USA", label: "USA" },
    { id: "comparative", label: "Comparative" },
    { id: "ideas", label: "Ideas" },
  ],
  drawers: [
    {
      id: 1,
      name: "Getting a say",
      blurb: "Elections, voting systems, referendums, voting behaviour.",
    },
    {
      id: 2,
      name: "The teams",
      blurb: "Political parties and what they stand for.",
    },
    {
      id: 3,
      name: "Pressure from outside",
      blurb: "Pressure groups, media, lobbying, protest.",
    },
    {
      id: 4,
      name: "Making the laws",
      blurb: "Parliament in the UK, Congress in the USA.",
    },
    {
      id: 5,
      name: "Running things and checking them",
      blurb:
        "PM and government, or President. Plus the courts (Supreme Court) and the limits the constitution sets.",
    },
  ],
  ideas: {
    label: "The ideas layer",
    strands: [
      { id: "liberalism", name: "Liberalism" },
      { id: "conservatism", name: "Conservatism" },
      { id: "socialism", name: "Socialism" },
      // The fourth ideology depends on what her class studies. Left generic for
      // v1 so the layer is complete without guessing the wrong one.
      { id: "extra", name: "The fourth idea your class studies" },
    ],
  },
};
