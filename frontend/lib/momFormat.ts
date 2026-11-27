export interface DetailedDiscussionSection {
  heading: string;
  summary: string;
  keyPoints: string[];
}

export interface MeetingActionItem {
  task: string;
  owner: string;
  dueDate: string;
  priority: string;
}

export interface MeetingMinutes {
  summary: string;
  detailedDiscussion?: DetailedDiscussionSection[];
  discussionTopics: string[];
  decisions: string[];
  actionItems: MeetingActionItem[];
  risksAndBlockers: string[];
  openQuestions: string[];
  keyTakeaways?: string[];
  nextMeeting: string;
}

export interface MeetingMomContext {
  title: string;
  scheduledAt?: string | null;
  durationMinutes?: number;
  host?: { name?: string | null } | null;
  participants?: Array<{ user?: { name?: string | null } | null }>;
}

export function splitParagraphs(text: string): string[] {
  return String(text || "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function formatMinutesMarkdown(meeting: MeetingMomContext, minutes: MeetingMinutes): string {
  const lines: string[] = [`# Minutes of Meeting: ${meeting.title}`];

  const meta: string[] = [];
  if (meeting.scheduledAt) {
    const formatted = new Intl.DateTimeFormat("en-IN", {
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date(meeting.scheduledAt));
    meta.push(`**Date & Time:** ${formatted}`);
  }
  if (meeting.host?.name) meta.push(`**Host:** ${meeting.host.name}`);
  const participantNames = (meeting.participants || [])
    .map((participant) => participant.user?.name)
    .filter((name): name is string => Boolean(name));
  if (participantNames.length > 0) {
    meta.push(`**Participants:** ${[...new Set(participantNames)].join(", ")}`);
  }
  if (meta.length > 0) {
    lines.push("", ...meta);
  }

  if (minutes.summary?.trim()) {
    lines.push("", "## Executive Summary", ...splitParagraphs(minutes.summary));
  }

  const detailed = minutes.detailedDiscussion?.filter(
    (section) => section.heading || section.summary || section.keyPoints?.length,
  );
  if (detailed && detailed.length > 0) {
    lines.push("", "## Detailed Discussion");
    detailed.forEach((section, index) => {
      lines.push("", `### ${index + 1}. ${section.heading || "Discussion Point"}`);
      if (section.summary) lines.push(...splitParagraphs(section.summary));
      if (section.keyPoints?.length) {
        lines.push(...section.keyPoints.map((point) => `- ${point}`));
      }
    });
  } else if (minutes.discussionTopics?.length > 0) {
    lines.push("", "## Discussion Topics", ...minutes.discussionTopics.map((item) => `- ${item}`));
  }

  if (minutes.decisions?.length > 0) {
    lines.push("", "## Decisions", ...minutes.decisions.map((item) => `- ${item}`));
  }

  if (minutes.actionItems?.length > 0) {
    lines.push(
      "",
      "## Action Items",
      ...minutes.actionItems.map(
        (item) => `- **${item.task}** — Owner: ${item.owner} | Due: ${item.dueDate} | Priority: ${item.priority}`,
      ),
    );
  }

  if (minutes.risksAndBlockers?.length > 0) {
    lines.push("", "## Risks & Blockers", ...minutes.risksAndBlockers.map((item) => `- ${item}`));
  }

  if (minutes.openQuestions?.length > 0) {
    lines.push("", "## Open Questions", ...minutes.openQuestions.map((item) => `- ${item}`));
  }

  if (minutes.keyTakeaways && minutes.keyTakeaways.length > 0) {
    lines.push("", "## Key Takeaways", ...minutes.keyTakeaways.map((item) => `- ${item}`));
  }

  if (minutes.nextMeeting?.trim()) {
    lines.push("", "## Next Meeting", minutes.nextMeeting.trim());
  }

  return lines.join("\n").trim();
}
