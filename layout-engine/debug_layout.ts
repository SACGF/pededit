import { alignPedigree } from "./src/alignPedigree.js";
import { buildPedigreeFromFlat } from "./src/utils.js";
import { SAMPLE_PED_1 } from "./tests/fixtures/samplePed.js";

const ped = buildPedigreeFromFlat(SAMPLE_PED_1);
const result = alignPedigree(ped);

console.log("n:", result.n);
console.log("Total slots:", result.n.reduce((a,b)=>a+b,0));

const allIds = new Set(result.nid.flat());
console.log("Unique IDs:", allIds.size);

const missing: number[] = [];
for (let i = 1; i <= 41; i++) {
  if (!allIds.has(i)) missing.push(i);
}
console.log("Missing IDs:", missing);

for (let lev = 0; lev < result.n.length; lev++) {
  console.log(`Level ${lev+1} (n=${result.n[lev]}):`, 
    result.nid[lev]?.slice(0, result.n[lev]!));
}
