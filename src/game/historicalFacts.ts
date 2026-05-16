export type HistoricalFactCategory =
  | "earthquake"
  | "tsunami"
  | "reactor"
  | "cooling"
  | "robotics"
  | "cleanup"
  | "safety";

export interface HistoricalFact {
  id: number;
  year: number;
  timestamp: string;
  title: string;
  shortText: string;
  detailedText?: string;
  category: HistoricalFactCategory;
  unlockOrder: number;
}

export const HISTORICAL_FACTS: HistoricalFact[] = [
  {
    id: 1,
    year: 2011,
    timestamp: "March 11, 2011 - 2:46 PM JST",
    title: "The Earthquake Strikes",
    shortText:
      "A magnitude 9.0 earthquake struck off Japan's northeastern coast, becoming one of the strongest earthquakes ever recorded in the country.",
    category: "earthquake",
    unlockOrder: 1
  },
  {
    id: 2,
    year: 2011,
    timestamp: "March 11, 2011 - shortly after 2:46 PM JST",
    title: "Reactors Automatically Shut Down",
    shortText:
      "The Fukushima reactors automatically inserted control rods to stop nuclear fission immediately after the earthquake.",
    detailedText:
      "Even after shutdown, reactors still produced dangerous heat and required cooling systems.",
    category: "reactor",
    unlockOrder: 2
  },
  {
    id: 3,
    year: 2011,
    timestamp: "March 11, 2011 - roughly 40 minutes later",
    title: "The Tsunami Arrives",
    shortText:
      "Roughly 40 minutes after the earthquake, a massive tsunami flooded the power plant and overwhelmed protective seawalls.",
    category: "tsunami",
    unlockOrder: 3
  },
  {
    id: 4,
    year: 2011,
    timestamp: "March 11, 2011 - afternoon JST",
    title: "Emergency Generators Failed",
    shortText:
      "Floodwaters disabled backup diesel generators that powered reactor cooling systems.",
    category: "cooling",
    unlockOrder: 4
  },
  {
    id: 5,
    year: 2011,
    timestamp: "March 11, 2011 - evening JST",
    title: "Cooling Systems Stopped",
    shortText:
      "Without electricity, pumps could no longer circulate cooling water through the reactors.",
    category: "cooling",
    unlockOrder: 5
  },
  {
    id: 6,
    year: 2011,
    timestamp: "March 2011",
    title: "Shutdown Did Not Stop Heat",
    shortText:
      "Even after reactors stop generating power, radioactive fuel continues producing intense heat for days or weeks.",
    category: "reactor",
    unlockOrder: 6
  },
  {
    id: 7,
    year: 2011,
    timestamp: "March 2011",
    title: "Hydrogen Began Building Up",
    shortText:
      "Overheating fuel rods reacted with steam and created hydrogen gas inside reactor buildings.",
    category: "reactor",
    unlockOrder: 7
  },
  {
    id: 8,
    year: 2011,
    timestamp: "March 2011",
    title: "Fuel Damage Began",
    shortText:
      "As temperatures rose, nuclear fuel assemblies became damaged and began melting.",
    category: "reactor",
    unlockOrder: 8
  },
  {
    id: 9,
    year: 2011,
    timestamp: "March 12, 2011",
    title: "Explosion at Reactor Unit 1",
    shortText:
      "Hydrogen gas exploded inside Reactor Unit 1, severely damaging the outer building structure.",
    category: "reactor",
    unlockOrder: 9
  },
  {
    id: 10,
    year: 2011,
    timestamp: "March 2011",
    title: "More Reactors Were Affected",
    shortText:
      "Reactor Units 2 and 3 also experienced severe cooling failures and core damage.",
    category: "reactor",
    unlockOrder: 10
  },
  {
    id: 11,
    year: 2011,
    timestamp: "March 2011",
    title: "Workers Stayed Behind",
    shortText:
      "Emergency crews remained onsite under dangerous conditions to restore cooling and stabilize the reactors.",
    category: "safety",
    unlockOrder: 11
  },
  {
    id: 12,
    year: 2011,
    timestamp: "March 2011",
    title: "Seawater Was Injected",
    shortText:
      "Operators pumped seawater into damaged reactors as a last-resort emergency cooling measure.",
    category: "cooling",
    unlockOrder: 12
  },
  {
    id: 13,
    year: 2011,
    timestamp: "March 2011",
    title: "Residents Were Evacuated",
    shortText:
      "More than 100,000 people were evacuated from areas surrounding the plant.",
    category: "safety",
    unlockOrder: 13
  },
  {
    id: 14,
    year: 2011,
    timestamp: "2011 onward",
    title: "Radiation Levels Were Tracked",
    shortText:
      "Teams continuously monitored radiation levels in air, water, soil, and nearby communities.",
    category: "safety",
    unlockOrder: 14
  },
  {
    id: 15,
    year: 2011,
    timestamp: "2011 onward",
    title: "Robots Were Sent Inside",
    shortText:
      "Robots and remote-controlled machines entered dangerous areas too radioactive for humans.",
    category: "robotics",
    unlockOrder: 15
  },
  {
    id: 16,
    year: 2011,
    timestamp: "2011 onward",
    title: "Robots Explored Damaged Corridors",
    shortText:
      "Remote inspection robots mapped flooded tunnels and damaged reactor structures.",
    category: "robotics",
    unlockOrder: 16
  },
  {
    id: 17,
    year: 2011,
    timestamp: "2011 onward",
    title: "Cleanup Would Take Decades",
    shortText:
      "Removing damaged fuel and decommissioning the site became a long-term international engineering effort.",
    category: "cleanup",
    unlockOrder: 17
  },
  {
    id: 18,
    year: 2011,
    timestamp: "2011 onward",
    title: "Nuclear Safety Changed Worldwide",
    shortText:
      "Countries around the world reviewed reactor safety systems and emergency preparedness after Fukushima.",
    category: "safety",
    unlockOrder: 18
  },
  {
    id: 19,
    year: 2011,
    timestamp: "2011 onward",
    title: "Robotics Research Accelerated",
    shortText:
      "The disaster increased investment in robotics designed for hazardous industrial environments.",
    category: "robotics",
    unlockOrder: 19
  },
  {
    id: 20,
    year: 2011,
    timestamp: "2011-present",
    title: "Recovery Continues Today",
    shortText:
      "Cleanup and environmental monitoring efforts at Fukushima continue more than a decade later.",
    category: "cleanup",
    unlockOrder: 20
  }
];

export const getNextHistoricalFact = (
  unlockedFactIds: Iterable<number>
): HistoricalFact | undefined => {
  const unlocked = new Set(unlockedFactIds);
  return HISTORICAL_FACTS.find((fact) => !unlocked.has(fact.id));
};
