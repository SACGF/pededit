#!/usr/bin/env Rscript
#
# Kinship oracle (#32, #87): run kinship2::kinship() and write the kinship
# coefficient of every related pair, autosomal and X-linked, for comparison
# with src/kinship.ts.
#
#   Rscript layout-engine/scripts/kinship-oracle.R <out.json> <name=in.ped> ...
#
# Each PED file gives one entry per family ID: `ids` in file order (the order
# the TypeScript PED importer uses) and `pairs`, the non-zero entries of the
# kinship matrix as [i, j, phi] with 1-based i <= j. The diagonal is the
# kinship of someone with themself, (1 + F) / 2.
#
# `pairs_x` is the same for kinship(chrtype = "x") (#87), where a male with
# himself is 1. It is left out of a family with anyone of unknown sex:
# kinship2 gives NA for an unknown-sex child and 0 (not a coefficient) on the
# diagonal of an unknown-sex founder, where src/kinship.ts keeps every value
# that does not depend on the unknown sex, so the two cannot be compared
# there. It is also left out of one-person families, where kinship2 returns
# sex / 2 (a male 1/2, a female 1), the wrong way round.
#
# PED files cannot say who is a twin, so the `twins` section is built here:
# small pedigrees with monozygotic sets, written out with their rows so the
# TypeScript test can rebuild them.
#
# Requires: kinship2, jsonlite.

suppressPackageStartupMessages({
  library(kinship2)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) stop("usage: kinship-oracle.R <out.json> <name=in.ped> ...")
outfile <- args[1]

sparse <- function(kin) {
  idx <- which(kin != 0 & upper.tri(kin, diag = TRUE), arr.ind = TRUE)
  idx <- idx[order(idx[, 1], idx[, 2]), , drop = FALSE]
  lapply(seq_len(nrow(idx)), function(k) I(c(idx[k, 1], idx[k, 2], kin[idx[k, 1], idx[k, 2]])))
}

files <- list()
for (spec in args[-1]) {
  name <- sub("=.*$", "", spec)
  infile <- sub("^[^=]*=", "", spec)
  ped <- read.table(infile, header = FALSE, comment.char = "#",
                    colClasses = "character", stringsAsFactors = FALSE)[, 1:6]
  names(ped) <- c("fid", "iid", "pat", "mat", "sex", "pheno")
  sex_code <- as.integer(ped$sex)
  sex_code[is.na(sex_code) | !(sex_code %in% c(1L, 2L))] <- 3L
  families <- list()
  for (fid in unique(ped$fid)) {
    rows <- ped[ped$fid == fid, ]
    # kinship2 refuses some families the editor accepts (a father recorded
    # as female, say). Those are left out and named on stderr.
    p <- try(pedigree(id = rows$iid, dadid = rows$pat, momid = rows$mat,
                      sex = sex_code[ped$fid == fid], missid = "0"), silent = TRUE)
    if (inherits(p, "try-error")) {
      message("skipped ", name, "/", fid, ": ", trimws(conditionMessage(attr(p, "condition"))))
      next
    }
    fam <- list(ids = I(rows$iid), pairs = sparse(kinship(p)))
    if (nrow(rows) > 1 && all(sex_code[ped$fid == fid] %in% c(1L, 2L))) {
      fam$pairs_x <- sparse(kinship(p, chrtype = "x"))
    }
    families[[fid]] <- fam
  }
  if (length(families)) files[[name]] <- list(source = infile, families = families)
}

# id, dad, mom, sex (1 male, 2 female); 0 = founder.
twin_case <- function(rows, mz) {
  d <- as.data.frame(matrix(rows, ncol = 4, byrow = TRUE))
  names(d) <- c("id", "dad", "mom", "sex")
  rel <- do.call(rbind, lapply(mz, function(set) {
    # kinship2 wants every pair of a set listed.
    t(combn(set, 2))
  }))
  rel <- data.frame(id1 = rel[, 1], id2 = rel[, 2], code = 1)
  p <- pedigree(id = d$id, dadid = d$dad, momid = d$mom, sex = d$sex,
                relation = rel, missid = 0)
  list(rows = lapply(seq_len(nrow(d)), function(i) I(as.integer(d[i, ]))),
       mz = lapply(mz, function(s) I(as.integer(s))),
       ids = I(as.integer(d$id)), pairs = sparse(kinship(p)),
       pairs_x = sparse(kinship(p, chrtype = "x")))
}

twins <- list(
  # MZ twin sisters, each with children: the cousins are as close as half siblings.
  mz_sisters_children = twin_case(c(
    1, 0, 0, 1,   2, 0, 0, 2,
    3, 1, 2, 2,   4, 1, 2, 2,
    5, 0, 0, 1,   6, 0, 0, 1,
    7, 5, 3, 1,   8, 6, 4, 2,
    9, 7, 8, 1), list(c(3, 4))),
  # MZ triplets with an ordinary sibling.
  mz_triplets = twin_case(c(
    1, 0, 0, 1,   2, 0, 0, 2,
    3, 1, 2, 1,   4, 1, 2, 1,   5, 1, 2, 1,   6, 1, 2, 2,
    7, 0, 0, 2,   8, 4, 7, 1), list(c(3, 4, 5))),
  # MZ twins who are themselves inbred (parents are first cousins).
  mz_inbred = twin_case(c(
    1, 0, 0, 1,   2, 0, 0, 2,
    3, 1, 2, 1,   4, 1, 2, 2,
    5, 0, 0, 2,   6, 0, 0, 1,
    7, 3, 5, 1,   8, 6, 4, 2,
    9, 7, 8, 2,   10, 7, 8, 2,
    11, 0, 0, 1,  12, 11, 9, 1,  13, 11, 10, 2), list(c(9, 10)))
)

out <- list(kinship2 = as.character(packageVersion("kinship2")), files = files, twins = twins)
writeLines(toJSON(out, auto_unbox = TRUE, digits = 12), outfile)
