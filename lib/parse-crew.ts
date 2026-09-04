export const CREW_ROLES = ["CP", "FO", "SE", "ST", "JU"] as const;

export type CrewRole = (typeof CREW_ROLES)[number];

export const CREW_ROLE_LABELS: Record<CrewRole, string> = {
  CP: "Captain",
  FO: "First Officer",
  SE: "Senior Cabin Crew",
  ST: "Cabin Crew",
  JU: "Junior Cabin Crew",
};

export type CrewMember = {
  role: CrewRole;
  label: string;
  code: string;
  you?: boolean;
};

export type ParsedCrewNotes = {
  crew: CrewMember[];
  leftover: string;
};

const ROLE_ALT = CREW_ROLES.join("|");
const CREW_TOKEN_RE = new RegExp(`\\b(${ROLE_ALT})\\s*:\\s*([A-Z0-9]{2,6})\\b`, "gi");

const POSITION_TO_ROLE: Record<string, CrewRole> = {
  CP: "CP",
  CAPTAIN: "CP",
  FO: "FO",
  SE: "SE",
  SCC: "SE",
  PURSER: "SE",
  L1: "SE",
  ST: "ST",
  JU: "JU",
};

function isCrewRole(value: string): value is CrewRole {
  return (CREW_ROLES as readonly string[]).includes(value);
}

function tidyLeftover(text: string) {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/^[ ·,;/-]+|[ ·,;/-]+$/g, "")
    .trim();
}

export function parseCrewNotes(text?: string | null): ParsedCrewNotes {
  if (!text?.trim()) return { crew: [], leftover: "" };

  const crew: CrewMember[] = [];
  const leftover = tidyLeftover(
    text.replace(CREW_TOKEN_RE, (_, role: string, code: string) => {
      const key = role.toUpperCase();
      if (!isCrewRole(key)) return " ";
      crew.push({
        role: key,
        label: CREW_ROLE_LABELS[key],
        code: code.toUpperCase(),
      });
      return " ";
    }),
  );

  return { crew, leftover };
}

export function parseDutyCrew(duty: { notes?: string; title?: string }): ParsedCrewNotes {
  const fromNotes = parseCrewNotes(duty.notes);
  if (fromNotes.crew.length) return fromNotes;
  const fromTitle = parseCrewNotes(duty.title);
  if (!fromTitle.crew.length) return fromNotes;
  return { crew: fromTitle.crew, leftover: fromNotes.leftover };
}

function looksLikeStaffCode(value: string) {
  return /^[A-Z0-9]{2,6}$/.test(value);
}

export function withYouHighlight(
  crew: CrewMember[],
  identity?: { name?: string; position?: string },
): CrewMember[] {
  if (!crew.length || !identity) return crew.map((member) => ({ ...member, you: false }));

  const name = identity.name?.trim().toUpperCase() ?? "";
  const position = identity.position?.trim().toUpperCase() ?? "";
  const mappedRole = POSITION_TO_ROLE[position];

  let youIndex = -1;
  if (name && looksLikeStaffCode(name)) {
    youIndex = crew.findIndex((member) => member.code === name);
  }
  if (youIndex < 0 && mappedRole) {
    const matches = crew
      .map((member, index) => (member.role === mappedRole ? index : -1))
      .filter((index) => index >= 0);
    if (matches.length === 1) youIndex = matches[0];
  }

  return crew.map((member, index) => ({ ...member, you: index === youIndex }));
}
