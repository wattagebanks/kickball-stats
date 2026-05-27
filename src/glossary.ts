// Central glossary of every abbreviation surfaced in the UI. Used by the
// `<Abbr>` component, table column `title` attributes, and the Stats tab's
// Glossary card so we only spell each meaning out in one place.

export interface GlossaryEntry {
  code: string;
  label: string;
  // A short, hover-tooltip-friendly description.
  description: string;
  // Coarse grouping used by the Glossary card.
  group: "kicking" | "batting" | "fielding" | "position" | "other";
}

export const GLOSSARY_ENTRIES: GlossaryEntry[] = [
  // Kicking results
  { code: "OUT", label: "Out", description: "Made out", group: "kicking" },
  { code: "1B", label: "Single", description: "Single", group: "kicking" },
  { code: "2B", label: "Double", description: "Double", group: "kicking" },
  { code: "3B", label: "Triple", description: "Triple", group: "kicking" },
  { code: "HR", label: "Home run", description: "Home run", group: "kicking" },
  {
    code: "BB",
    label: "Walk",
    description: "Walk (base on balls)",
    group: "kicking",
  },
  {
    code: "SAC",
    label: "Sacrifice",
    description: "Sacrifice",
    group: "kicking",
  },
  {
    code: "FC",
    label: "Fielder's choice",
    description: "Fielder's choice",
    group: "kicking",
  },
  {
    code: "ROE",
    label: "Reached on error",
    description: "Reached on error",
    group: "kicking",
  },

  // Batting / stats table
  {
    code: "PA",
    label: "Plate appearances",
    description: "Plate appearances",
    group: "batting",
  },
  {
    code: "AB",
    label: "At-bats",
    description: "At-bats (walks and sacrifices excluded)",
    group: "batting",
  },
  { code: "H", label: "Hits", description: "Hits", group: "batting" },
  {
    code: "RBI",
    label: "Runs batted in",
    description: "Runs batted in",
    group: "batting",
  },
  { code: "R", label: "Runs", description: "Runs scored", group: "batting" },
  {
    code: "AVG",
    label: "Batting average",
    description: "Batting average — Hits / At-bats",
    group: "batting",
  },
  {
    code: "OBP",
    label: "On-base percentage",
    description:
      "On-base percentage — (Hits + Walks) / (At-bats + Walks + Sacrifices)",
    group: "batting",
  },
  {
    code: "SLG",
    label: "Slugging percentage",
    description: "Slugging percentage — Total bases / At-bats",
    group: "batting",
  },

  // Fielding stats
  { code: "PO", label: "Putouts", description: "Putouts", group: "fielding" },
  { code: "A", label: "Assists", description: "Assists", group: "fielding" },
  {
    code: "E",
    label: "Errors",
    description: "Errors (fielding mistakes)",
    group: "fielding",
  },
  {
    code: "F%",
    label: "Fielding percentage",
    description:
      "Fielding percentage — (Putouts + Assists) / (Putouts + Assists + Errors)",
    group: "fielding",
  },
  { code: "IF", label: "Infield", description: "Infield", group: "fielding" },
  {
    code: "OF",
    label: "Outfield",
    description: "Outfield",
    group: "fielding",
  },

  // Positions
  { code: "P", label: "Pitcher", description: "Pitcher", group: "position" },
  { code: "C", label: "Catcher", description: "Catcher", group: "position" },
  // Note: 1B/2B/3B already appear under kicking. Position meaning is
  // disambiguated by `descriptionFor()` callers when needed.
  {
    code: "SS",
    label: "Shortstop",
    description: "Shortstop",
    group: "position",
  },
  {
    code: "LF",
    label: "Left Field",
    description: "Left Field",
    group: "position",
  },
  {
    code: "LCF",
    label: "Left-Center",
    description: "Left-Center Field",
    group: "position",
  },
  {
    code: "RCF",
    label: "Right-Center",
    description: "Right-Center Field",
    group: "position",
  },
  {
    code: "RF",
    label: "Right Field",
    description: "Right Field",
    group: "position",
  },
  {
    code: "BENCH",
    label: "Bench",
    description: "Bench (not currently playing the field)",
    group: "position",
  },
];

// Quick lookup map for `<Abbr code="...">` and `<th title={GLOSSARY.PA}>` style
// callsites. The first occurrence in the entries array wins so kicking
// "1B/2B/3B" descriptions are surfaced by default; callers needing the position
// meaning should pass it explicitly.
export const GLOSSARY: Record<string, string> = GLOSSARY_ENTRIES.reduce(
  (acc, e) => {
    if (!(e.code in acc)) acc[e.code] = e.description;
    return acc;
  },
  {} as Record<string, string>,
);
