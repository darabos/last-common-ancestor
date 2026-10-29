const genders = ["male", "female"];

function createIndividual(id, generation, gender, fatherId = null, motherId = null, side = "population") {
  return { id, generation, gender, fatherId, motherId, side };
}

function choose(values, random) {
  return values[Math.floor(random() * values.length)];
}

function generatePopulation(size, previous, generation, side, random, nextId) {
  const fathers = previous.filter((individual) => individual.gender === "male");
  const mothers = previous.filter((individual) => individual.gender === "female");

  if (fathers.length === 0 || mothers.length === 0) {
    return null;
  }

  return Array.from({ length: size }, () => {
    const gender = choose(genders, random);
    const father = choose(fathers, random);
    const mother = choose(mothers, random);
    return createIndividual(nextId(), generation, gender, father.id, mother.id, side);
  });
}

export function simulatePopulation({ size, g1, g2, random = Math.random }) {
  if (!Number.isInteger(size) || size < 2 || size % 2 !== 0) {
    throw new RangeError("N must be an even integer of at least 2.");
  }
  if (!Number.isInteger(g1) || g1 < 1) {
    throw new RangeError("G1 must be an integer of at least 1.");
  }
  if (!Number.isInteger(g2) || g2 < 0) {
    throw new RangeError("G2 must be an integer of at least 0.");
  }
  if (typeof random !== "function") {
    throw new TypeError("random must be a function.");
  }

  let nextIndividualId = 1;
  const nextId = () => nextIndividualId++;
  const founders = Array.from({ length: size }, () =>
    createIndividual(nextId(), 1, choose(genders, random)),
  );
  const generations = [{
    number: 1,
    stage: g1 === 1 ? "split" : "pre-split",
    populations: [{ side: "population", individuals: founders }],
  }];
  let current = founders;

  for (let generation = 2; generation <= g1; generation += 1) {
    const next = generatePopulation(size, current, generation, "population", random, nextId);
    if (!next) {
      return {
        generations,
        individuals: generations.flatMap((row) => row.populations.flatMap((population) => population.individuals)),
        preSplitExtinct: true,
        extinctSides: [],
      };
    }

    current = next;
    generations.push({
      number: generation,
      stage: generation === g1 ? "split" : "pre-split",
      populations: [{ side: "population", individuals: current }],
    });
  }

  const splitRow = generations.at(-1);
  splitRow.populations = [
    { side: "left", individuals: current.slice(0, size / 2).map((individual) => ({ ...individual, side: "left" })) },
    { side: "right", individuals: current.slice(size / 2).map((individual) => ({ ...individual, side: "right" })) },
  ];

  const extinctSides = new Set();
  let left = splitRow.populations[0].individuals;
  let right = splitRow.populations[1].individuals;

  for (let offset = 1; offset <= g2; offset += 1) {
    const generation = g1 + offset;
    const nextLeft = extinctSides.has("left")
      ? null
      : generatePopulation(size / 2, left, generation, "left", random, nextId);
    const nextRight = extinctSides.has("right")
      ? null
      : generatePopulation(size / 2, right, generation, "right", random, nextId);

    if (!nextLeft) extinctSides.add("left");
    if (!nextRight) extinctSides.add("right");

    left = nextLeft ?? [];
    right = nextRight ?? [];
    generations.push({
      number: generation,
      stage: "post-split",
      populations: [
        { side: "left", individuals: left },
        { side: "right", individuals: right },
      ],
    });
  }

  return {
    generations,
    individuals: generations.flatMap((row) => row.populations.flatMap((population) => population.individuals)),
    preSplitExtinct: false,
    extinctSides: [...extinctSides],
  };
}

function asMap(individuals) {
  return individuals instanceof Map
    ? individuals
    : new Map(individuals.map((individual) => [individual.id, individual]));
}

export function isEligibleLineageEdge(parent, child, lineage = "both", direction = "descendant") {
  if (lineage === "paternal") {
    return parent.gender === "male"
      && child.fatherId === parent.id
      && (direction === "ancestor" || child.gender === "male");
  }
  if (lineage === "maternal") {
    return parent.gender === "female"
      && child.motherId === parent.id
      && (direction === "ancestor" || child.gender === "female");
  }
  return child.fatherId === parent.id || child.motherId === parent.id;
}

export function findAncestors(individualId, individuals, includeSelf = false, lineage = "both") {
  const byId = asMap(individuals);
  const ancestors = new Set(includeSelf ? [individualId] : []);
  const pending = [individualId];

  while (pending.length > 0) {
    const individual = byId.get(pending.pop());
    if (!individual) continue;

    for (const parentId of [individual.fatherId, individual.motherId]) {
      const parent = byId.get(parentId);
      if (parent && isEligibleLineageEdge(parent, individual, lineage, "ancestor") && !ancestors.has(parentId)) {
        ancestors.add(parentId);
        pending.push(parentId);
      }
    }
  }

  return ancestors;
}

export function findDescendants(individualId, individuals, includeSelf = false, lineage = "both") {
  const byId = asMap(individuals);
  const childrenByParent = new Map();

  for (const individual of byId.values()) {
    for (const parentId of [individual.fatherId, individual.motherId]) {
      const parent = byId.get(parentId);
      if (!parent || !isEligibleLineageEdge(parent, individual, lineage)) continue;
      const children = childrenByParent.get(parentId) ?? [];
      children.push(individual.id);
      childrenByParent.set(parentId, children);
    }
  }

  const descendants = new Set(includeSelf ? [individualId] : []);
  const pending = [individualId];

  while (pending.length > 0) {
    for (const childId of childrenByParent.get(pending.pop()) ?? []) {
      if (!descendants.has(childId)) {
        descendants.add(childId);
        pending.push(childId);
      }
    }
  }

  return descendants;
}

export function findLastCommonAncestors(selectedIds, individuals, lineage = "both") {
  if (selectedIds.length < 2) return new Set();

  const byId = asMap(individuals);
  const [firstId, ...otherIds] = selectedIds;
  const common = findAncestors(firstId, byId, true, lineage);

  for (const individualId of otherIds) {
    const ancestors = findAncestors(individualId, byId, true, lineage);
    for (const candidateId of common) {
      if (!ancestors.has(candidateId)) common.delete(candidateId);
    }
  }

  if (common.size === 0) return common;
  const newestGeneration = Math.max(...[...common].map((id) => byId.get(id)?.generation ?? -1));

  return new Set([...common].filter((id) => byId.get(id)?.generation === newestGeneration));
}
