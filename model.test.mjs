import assert from "node:assert/strict";
import test from "node:test";
import {
  findAncestors,
  findDescendants,
  findLastCommonAncestors,
  isEligibleLineageEdge,
  simulatePopulation,
} from "./model.mjs";

function alternatingRandom() {
  const values = [0.1, 0.9, 0.2, 0.8];
  let index = 0;
  return () => values[index++ % values.length];
}

function randomWithPrefix(prefix) {
  const fallback = alternatingRandom();
  let index = 0;
  return () => (index < prefix.length ? prefix[index++] : fallback());
}

test("validates population and generation inputs", () => {
  assert.throws(() => simulatePopulation({ size: 3, g1: 1, g2: 0 }), RangeError);
  assert.throws(() => simulatePopulation({ size: 2, g1: 0, g2: 0 }), RangeError);
  assert.throws(() => simulatePopulation({ size: 2, g1: 1, g2: -1 }), RangeError);
});

test("creates full pre-split rows and gender-matched parents", () => {
  const result = simulatePopulation({ size: 4, g1: 3, g2: 0, random: alternatingRandom() });
  const byId = new Map(result.individuals.map((individual) => [individual.id, individual]));

  assert.equal(result.generations.length, 3);
  assert.deepEqual(result.generations.slice(0, 2).map((row) => row.populations[0].individuals.length), [4, 4]);
  assert.deepEqual(result.generations[2].populations.map((population) => population.individuals.length), [2, 2]);

  for (const individual of result.individuals.filter((entry) => entry.generation > 1)) {
    const father = byId.get(individual.fatherId);
    const mother = byId.get(individual.motherId);
    assert.equal(father.gender, "male");
    assert.equal(mother.gender, "female");
    assert.equal(father.generation, individual.generation - 1);
    assert.equal(mother.generation, individual.generation - 1);
  }
});

test("stops a lineage when its source has no eligible parent role", () => {
  const extinct = simulatePopulation({ size: 4, g1: 2, g2: 2, random: () => 0.1 });
  assert.equal(extinct.preSplitExtinct, true);
  assert.equal(extinct.generations.length, 1);

  const split = simulatePopulation({ size: 4, g1: 1, g2: 1, random: randomWithPrefix([0.1, 0.1, 0.1, 0.9]) });
  assert.deepEqual(split.extinctSides, ["left"]);
  assert.equal(split.generations[1].populations[0].individuals.length, 0);
  assert.equal(split.generations[1].populations[1].individuals.length, 2);
});

test("finds ancestor and descendant closure and newest shared ancestors", () => {
  const individuals = [
    { id: "a", generation: 1, fatherId: null, motherId: null },
    { id: "b", generation: 2, fatherId: "a", motherId: null },
    { id: "c", generation: 2, fatherId: "a", motherId: null },
    { id: "d", generation: 3, fatherId: "b", motherId: "c" },
    { id: "e", generation: 3, fatherId: "b", motherId: "c" },
  ];

  assert.deepEqual(findAncestors("d", individuals), new Set(["b", "c", "a"]));
  assert.deepEqual(findDescendants("b", individuals), new Set(["d", "e"]));
  assert.deepEqual(findLastCommonAncestors(["d", "e"], individuals), new Set(["b", "c"]));
  assert.deepEqual(findLastCommonAncestors(["b", "d"], individuals), new Set(["b"]));
  assert.deepEqual(findLastCommonAncestors(["d"], individuals), new Set());
});

test("restricts traversal and common ancestors to the selected lineage", () => {
  const individuals = [
    { id: "p-root", generation: 1, gender: "male", fatherId: null, motherId: null },
    { id: "m-root", generation: 1, gender: "female", fatherId: null, motherId: null },
    { id: "father", generation: 2, gender: "male", fatherId: "p-root", motherId: "m-root" },
    { id: "mother", generation: 2, gender: "female", fatherId: "p-root", motherId: "m-root" },
    { id: "son-a", generation: 3, gender: "male", fatherId: "father", motherId: "mother" },
    { id: "son-b", generation: 3, gender: "male", fatherId: "father", motherId: "mother" },
    { id: "daughter", generation: 3, gender: "female", fatherId: "father", motherId: "mother" },
    { id: "daughter-b", generation: 3, gender: "female", fatherId: "father", motherId: "mother" },
    { id: "grandson", generation: 4, gender: "male", fatherId: "son-a", motherId: "daughter" },
    { id: "granddaughter", generation: 4, gender: "female", fatherId: "son-a", motherId: "daughter" },
  ];

  assert.deepEqual(findAncestors("son-a", individuals, false, "paternal"), new Set(["father", "p-root"]));
  assert.deepEqual(findAncestors("daughter", individuals, false, "paternal"), new Set(["father", "p-root"]));
  assert.deepEqual(findAncestors("son-a", individuals, false, "maternal"), new Set(["mother", "m-root"]));
  assert.deepEqual(findAncestors("daughter", individuals, false, "maternal"), new Set(["mother", "m-root"]));
  assert.deepEqual(findDescendants("father", individuals, false, "paternal"), new Set(["son-a", "son-b", "grandson"]));
  assert.deepEqual(findDescendants("mother", individuals, false, "maternal"), new Set(["daughter", "daughter-b", "granddaughter"]));
  assert.deepEqual(findLastCommonAncestors(["son-a", "son-b"], individuals, "paternal"), new Set(["father"]));
  assert.deepEqual(findLastCommonAncestors(["son-a", "son-b"], individuals, "maternal"), new Set(["mother"]));
  assert.deepEqual(findLastCommonAncestors(["daughter", "daughter-b"], individuals, "maternal"), new Set(["mother"]));
  assert.equal(isEligibleLineageEdge(individuals[2], individuals[6], "paternal"), false);
  assert.equal(isEligibleLineageEdge(individuals[2], individuals[6], "paternal", "ancestor"), true);
  assert.equal(isEligibleLineageEdge(individuals[3], individuals[4], "maternal"), false);
  assert.equal(isEligibleLineageEdge(individuals[3], individuals[4], "maternal", "ancestor"), true);
  assert.equal(isEligibleLineageEdge(individuals[3], individuals[6], "maternal"), true);
});
