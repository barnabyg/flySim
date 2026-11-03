import { TRANSITIONS, type RelationshipLabel, type RelationshipStatus } from "../engine";
import type { ValidationReport } from "../validation/report";
import { BEHAVIOUR_NAMES, DRIVER_NAMES } from "./palette";
import { escapeHtml } from "./validationChart";

const STATUSES: readonly { status: RelationshipStatus; name: string; meaning: string }[] = [
  {
    status: "established",
    name: "Established",
    meaning: "A counted Evidence Pack target supports it.",
  },
  {
    status: "provisional",
    name: "Provisional",
    meaning: "Roughly tuned or plausible, but not validated.",
  },
  {
    status: "hypothesis",
    name: "Hypothesis",
    meaning: "The model's own proposal, which no source measures.",
  },
];

interface Entry {
  readonly kind: "driver" | "parameter";
  readonly id: string;
  readonly name: string;
  readonly label: RelationshipLabel;
}

function transitionName(id: string): string {
  const transition = TRANSITIONS.find((each) => each.id === id);
  return transition
    ? `${BEHAVIOUR_NAMES[transition.from]} → ${BEHAVIOUR_NAMES[transition.to].toLowerCase()}`
    : id;
}

/** Where an Established label's evidence is, by the targets in the report that it cites. */
function evidenceHtml(report: ValidationReport, ids: readonly string[]): string {
  return ids
    .map((id) => {
      const target = report.targets.find((each) => each.id === id || each.id.startsWith(`${id}:`));
      return target
        ? `<div class="tooltip-note"><b>${escapeHtml(target.title)}</b> · ${escapeHtml(target.citation)}</div>`
        : `<div class="tooltip-note">${escapeHtml(id)}</div>`;
    })
    .join("");
}

function entryHtml(report: ValidationReport, entry: Entry, tips: string[]): string {
  const { label } = entry;
  const evidence = label.status === "established" ? evidenceHtml(report, label.evidence ?? []) : "";
  tips.push(
    `<div class="tooltip-heading">${escapeHtml(entry.name)}</div><div class="tooltip-text">${escapeHtml(label.description)}</div>${evidence}`,
  );
  return `<li data-relationship="${escapeHtml(entry.id)}" data-kind="${entry.kind}" data-status="${label.status}" data-tip="${tips.length - 1}">${escapeHtml(entry.name)}</li>`;
}

/**
 * Every Driver relationship and parameter of the model that made the report, grouped by its label,
 * with what it is on hover, and the source for an Established one.
 */
export function relationshipsHtml(report: ValidationReport, tips: string[]): string {
  const entries: Entry[] = [
    ...report.relationships.drivers.map((each) => ({
      kind: "driver" as const,
      id: `${each.transition} ${each.driver}`,
      name: `${DRIVER_NAMES[each.driver]}: ${transitionName(each.transition)}`,
      label: each,
    })),
    ...Object.entries(report.relationships.parameters).map(([name, label]) => ({
      kind: "parameter" as const,
      id: name,
      name,
      label,
    })),
  ];
  const groups = STATUSES.map(({ status, name, meaning }) => {
    const inGroup = entries.filter((entry) => entry.label.status === status);
    const list = (kind: Entry["kind"], heading: string) => {
      const items = inGroup.filter((entry) => entry.kind === kind);
      return items.length === 0
        ? ""
        : `<h4>${heading}</h4><ul>${items.map((entry) => entryHtml(report, entry, tips)).join("")}</ul>`;
    };
    return `<div class="relationship-group" data-status="${status}">
      <h3>${name} <span class="count">${inGroup.length}</span></h3>
      <p class="group-meaning">${meaning}</p>
      ${list("driver", "Driver relationships")}
      ${list("parameter", "Parameters")}
    </div>`;
  });
  return `<section id="validation-relationships" class="validation-section">
    <h2>What the model rests on</h2>
    <p class="section-note">Each relationship and parameter in the model, by how far it is measured biology. Hover over one for what it is, and for an Established one, the target that supports it.</p>
    <div class="relationship-groups">${groups.join("")}</div>
  </section>`;
}
