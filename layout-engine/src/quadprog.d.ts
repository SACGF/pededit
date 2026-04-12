declare module "quadprog" {
  export function solveQP(
    Dmat: number[][],
    dvec: number[],
    Amat: number[][],
    bvec: number[],
    meq?: number,
  ): { solution: number[] };
}
