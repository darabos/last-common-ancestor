import {
  findAncestors,
  findDescendants,
  findLastCommonAncestors,
  simulatePopulation,
} from "./model.mjs";

const form = document.querySelector("#simulation-form");
const sizeInput = document.querySelector("#population-size");
const g1Input = document.querySelector("#pre-split-generations");
const g2Input = document.querySelector("#post-split-generations");
const errorMessage = document.querySelector("#form-error");
const stamp = document.querySelector("#simulation-stamp");
const generationCount = document.querySelector("#generation-count");
const diagram = document.querySelector("#genealogy");
const emptyState = document.querySelector("#empty-state");
const statusMessage = document.querySelector("#status-message");
const selectionSummary = document.querySelector("#selection-summary");
const clearButton = document.querySelector("#clear-selection");

let simulation = null;
let selectedIds = new Set();

function svgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function setFormError(message) {
  errorMessage.textContent = message;
  stamp.textContent = message ? "CHECK INPUT" : "READY";
}

function runSimulation(event) {
  event?.preventDefault();
  const size = Number(sizeInput.value);
  const g1 = Number(g1Input.value);
  const g2 = Number(g2Input.value);

  if (!Number.isInteger(size) || size < 2 || size % 2 !== 0) {
    setFormError("N must be an even whole number of at least 2.");
    sizeInput.focus();
    return;
  }
  if (!Number.isInteger(g1) || g1 < 1) {
    setFormError("G1 must be a whole number of at least 1.");
    g1Input.focus();
    return;
  }
  if (!Number.isInteger(g2) || g2 < 0) {
    setFormError("G2 must be a whole number of 0 or more.");
    g2Input.focus();
    return;
  }

  try {
    simulation = simulatePopulation({ size, g1, g2 });
  } catch (error) {
    setFormError(error instanceof Error ? error.message : "Unable to run this simulation.");
    return;
  }

  selectedIds = new Set();
  setFormError("");
  stamp.textContent = "COMPLETE";
  render();
}

function layoutIndividuals() {
  const width = Math.max(1080, Number(sizeInput.value) * 70 + 200);
  const rowHeight = 106;
  const top = 96;
  const height = top + simulation.generations.length * rowHeight + 48;
  const positions = new Map();
  const rowY = new Map();
  const midpoint = width / 2;

  simulation.generations.forEach((row, rowIndex) => {
    const y = top + rowIndex * rowHeight;
    rowY.set(row.number, y);

    for (const population of row.populations) {
      const { individuals, side } = population;
      let start = 64;
      let end = width - 64;
      if (side === "left") end = midpoint - 58;
      if (side === "right") start = midpoint + 58;

      individuals.forEach((individual, index) => {
        const x = individuals.length === 1
          ? (start + end) / 2
          : start + (end - start) * index / (individuals.length - 1);
        positions.set(individual.id, { x, y, individual });
      });
    }
  });

  return { width, height, positions, rowY, midpoint };
}

function getHighlights() {
  const ancestors = new Set();
  const descendants = new Set();
  const allIndividuals = simulation.individuals;

  for (const id of selectedIds) {
    for (const ancestorId of findAncestors(id, allIndividuals)) ancestors.add(ancestorId);
    for (const descendantId of findDescendants(id, allIndividuals)) descendants.add(descendantId);
  }

  return {
    ancestors,
    descendants,
    common: findLastCommonAncestors([...selectedIds], allIndividuals),
  };
}

function renderDiagram() {
  const { width, height, positions, rowY, midpoint } = layoutIndividuals();
  const { ancestors, descendants, common } = getHighlights();
  const fragment = document.createDocumentFragment();

  diagram.setAttribute("viewBox", `0 0 ${width} ${height}`);
  diagram.setAttribute("width", width);
  diagram.setAttribute("height", height);

  const splitRow = simulation.generations.find((row) => row.stage === "split");
  const labels = svgElement("g", { class: "row-labels" });
  for (const row of simulation.generations) {
    const y = rowY.get(row.number);
    const label = svgElement("text", { x: 20, y: y + 4, class: "generation-label" });
    label.textContent = `G${String(row.number).padStart(2, "0")}`;
    labels.append(label);
  }
  fragment.append(labels);

  if (splitRow) {
    const splitY = rowY.get(splitRow.number) - 42;
    const divider = svgElement("line", {
      x1: midpoint,
      y1: splitY - 18,
      x2: midpoint,
      y2: height - 24,
      class: "split-divider",
    });
    const leftLabel = svgElement("text", { x: midpoint / 2, y: splitY, class: "side-label", "text-anchor": "middle" });
    const rightLabel = svgElement("text", { x: midpoint + midpoint / 2, y: splitY, class: "side-label", "text-anchor": "middle" });
    leftLabel.textContent = "LEFT POPULATION";
    rightLabel.textContent = "RIGHT POPULATION";
    fragment.append(divider, leftLabel, rightLabel);
  }

  const links = svgElement("g", { class: "links" });
  for (const individual of simulation.individuals) {
    const child = positions.get(individual.id);
    if (!child || individual.fatherId === null || individual.motherId === null) continue;

    for (const parentId of [individual.fatherId, individual.motherId]) {
      const parent = positions.get(parentId);
      if (!parent) continue;
      const curve = (parent.y + child.y) / 2;
      links.append(svgElement("path", {
        d: `M ${parent.x} ${parent.y + 13} C ${parent.x} ${curve}, ${child.x} ${curve}, ${child.x} ${child.y - 13}`,
        class: `parent-link${selectedIds.has(parentId) || ancestors.has(parentId) || descendants.has(parentId) ? " is-related" : ""}`,
      }));
    }
  }
  fragment.append(links);

  const nodes = svgElement("g", { class: "nodes" });
  for (const individual of simulation.individuals) {
    const position = positions.get(individual.id);
    if (!position) continue;
    const isSelected = selectedIds.has(individual.id);
    const isRelated = ancestors.has(individual.id) || descendants.has(individual.id);
    const isCommon = common.has(individual.id);
    const classes = ["individual", individual.gender];
    if (isSelected) classes.push("is-selected");
    if (isRelated) classes.push("is-related");
    if (isCommon) classes.push("is-common");

    const node = svgElement("g", {
      class: classes.join(" "),
      transform: `translate(${position.x} ${position.y})`,
      role: "button",
      tabindex: "0",
      "aria-pressed": isSelected,
      "aria-label": `Generation ${individual.generation}, ${individual.gender}, individual ${individual.id}${isCommon ? ", last common ancestor" : ""}`,
      "data-id": individual.id,
    });
    node.append(svgElement("circle", { class: "node-halo", r: 19 }));
    node.append(svgElement("circle", { class: "node-core", r: 11 }));
    const label = svgElement("text", { class: "node-id", x: 0, y: 29, "text-anchor": "middle" });
    label.textContent = `#${individual.id}`;
    node.append(label);
    node.addEventListener("click", () => toggleSelection(individual.id));
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleSelection(individual.id);
      }
    });
    nodes.append(node);
  }
  fragment.append(nodes);

  diagram.replaceChildren(fragment);
}

function renderStatus() {
  const rowCount = simulation.generations.length;
  generationCount.textContent = `${rowCount} GENERATION${rowCount === 1 ? "" : "S"}`;
  emptyState.hidden = !simulation.preSplitExtinct;
  diagram.hidden = simulation.preSplitExtinct;

  if (simulation.preSplitExtinct) {
    statusMessage.textContent = `The population stopped before the split at generation ${rowCount}.`;
  } else if (simulation.extinctSides.length > 0) {
    const names = simulation.extinctSides.map((side) => `${side} side`).join(" and ");
    statusMessage.textContent = `The ${names} could not supply both parent roles and stopped.`;
  } else {
    statusMessage.textContent = `${simulation.individuals.length} individuals across ${rowCount} generations.`;
  }
}

function renderSelection() {
  const count = selectedIds.size;
  clearButton.disabled = count === 0;
  if (count === 0) {
    selectionSummary.textContent = "No individuals selected";
    return;
  }

  const common = findLastCommonAncestors([...selectedIds], simulation.individuals);
  const selectionLabel = `${count} individual${count === 1 ? "" : "s"} selected`;
  if (count < 2) {
    selectionSummary.textContent = selectionLabel;
  } else if (common.size === 0) {
    selectionSummary.textContent = `${selectionLabel} · no common ancestor`;
  } else {
    selectionSummary.textContent = `${selectionLabel} · ${common.size} last common ancestor${common.size === 1 ? "" : "s"}`;
  }
}

function render() {
  renderStatus();
  renderSelection();
  if (!simulation.preSplitExtinct) renderDiagram();
}

function toggleSelection(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  render();
}

form.addEventListener("submit", runSimulation);
clearButton.addEventListener("click", () => {
  selectedIds.clear();
  render();
});

runSimulation();
