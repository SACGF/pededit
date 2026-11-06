#!/usr/bin/env Rscript
#
# Layout oracle: run kinship2::align.pedigree() on a 6-column PED file and write
# the n, nid, pos, fam and spouse matrices as JSON, one entry per family ID.
#
#   Rscript layout-engine/scripts/kinship2-oracle.R <in.ped> <out.json>
#
# The individual indices in `nid` are 1-based positions in file order, the same
# order the TypeScript PED importer uses, so the two outputs compare slot for slot.
# Rows of each matrix are trimmed to n[level]. Kinship coefficients and the
# inbreeding coefficient of every individual are written as well, for reference.
#
# Requires: kinship2, jsonlite.

suppressPackageStartupMessages({
  library(kinship2)
  library(jsonlite)
})

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2) stop("usage: kinship2-oracle.R <in.ped> <out.json>")
infile <- args[1]
outfile <- args[2]

ped <- read.table(infile, header = FALSE, comment.char = "#",
                  colClasses = "character", stringsAsFactors = FALSE)
if (ncol(ped) < 6) stop("expected at least 6 columns: FID IID PAT MAT SEX PHENO")
ped <- ped[, 1:6]
names(ped) <- c("fid", "iid", "pat", "mat", "sex", "pheno")

sex_code <- as.integer(ped$sex)
sex_code[is.na(sex_code) | !(sex_code %in% c(1L, 2L))] <- 3L
aff <- ifelse(ped$pheno == "2", 1L, ifelse(ped$pheno == "1", 0L, NA_integer_))

# I() keeps single-element rows as JSON arrays under auto_unbox.
trim_rows <- function(m, n) {
  lapply(seq_along(n), function(i) {
    if (n[i] == 0) I(numeric(0)) else I(unname(m[i, seq_len(n[i])]))
  })
}

families <- list()
for (fid in unique(ped$fid)) {
  rows <- ped[ped$fid == fid, ]
  fam_aff <- aff[ped$fid == fid]
  # pedigree() warns when every phenotype is missing; leave affected out then.
  if (all(is.na(fam_aff))) {
    p <- pedigree(id = rows$iid, dadid = rows$pat, momid = rows$mat,
                  sex = sex_code[ped$fid == fid], missid = "0")
  } else {
    p <- pedigree(id = rows$iid, dadid = rows$pat, momid = rows$mat,
                  sex = sex_code[ped$fid == fid], affected = fam_aff,
                  missid = "0")
  }
  a <- align.pedigree(p)
  kin <- kinship(p)
  families[[fid]] <- list(
    ids = I(rows$iid),
    n = I(as.integer(a$n)),
    nid = trim_rows(a$nid, a$n),
    pos = trim_rows(a$pos, a$n),
    fam = trim_rows(a$fam, a$n),
    spouse = trim_rows(a$spouse, a$n),
    inbreeding = I(unname(2 * diag(kin) - 1))
  )
}

out <- list(
  source = basename(infile),
  kinship2 = as.character(packageVersion("kinship2")),
  families = families
)
writeLines(toJSON(out, auto_unbox = TRUE, digits = 10, pretty = TRUE), outfile)
