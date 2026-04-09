# local_min replaces zero fluA reads with the smallest read for that site
# otherwise uses the global smallest value to log-transform fluA reads
airdrie_raw <- loess_log_fitter('airdrie', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
local_critpoint(airdrie_raw, start_date = "2022-07-01", end_date = "2022-12-30")

# local_critpoint() needs to run twice
# first run provides flu season start and max dates
# second run provides the max and end dates
# summary lists will be combined; duplicated max dates will be dropped

### airdrie
airdrie <- loess_fitter('airdrie', c(0.1,0.2,0.3))

airdrie_raw_linear <- loess_log_fitter('airdrie', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
airdrie_raw1 <- local_critpoint(airdrie_raw_linear, start_date = "2022-08-01", end_date = "2022-12-30")
airdrie_raw2 <- local_critpoint(airdrie_raw_linear, start_date = "2022-11-20", end_date = "2023-03-28")

airdrie_raw_quad <- loess_log_fitter('airdrie', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
airdrie_raw3 <- local_critpoint(airdrie_raw_quad, start_date = "2022-08-01", end_date = "2022-12-30")
airdrie_raw4 <- local_critpoint(airdrie_raw_quad, start_date = "2022-11-20", end_date = "2023-03-28")

airdrie_dropzeros <- loess_log_fitter('airdrie', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
airdrie_dropzeros1 <- local_critpoint(airdrie_dropzeros, start_date = "2022-08-01", end_date = "2022-12-30")
airdrie_dropzeros2 <- local_critpoint(airdrie_dropzeros, start_date = "2022-08-01", end_date = "2023-03-28")

airdrie_complete <- list(airdrie_raw1, airdrie_raw2,
                         airdrie_raw3, airdrie_raw4,
                         airdrie_dropzeros1, airdrie_dropzeros2)

### banff
banff <- loess_fitter('banff', c(0.1,0.2,0.3))

banff_raw_linear <- loess_log_fitter('banff', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
banff_raw1 <- local_critpoint(banff_raw_linear, start_date = "2022-08-14", end_date = "2022-12-30")
banff_raw2 <- local_critpoint(banff_raw_linear, start_date = "2022-11-17", end_date = "2023-04-09")

banff_raw_quad <- loess_log_fitter('banff', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
banff_raw3 <- local_critpoint(banff_raw_quad, start_date = "2022-08-14", end_date = "2022-12-30")
banff_raw4 <- local_critpoint(banff_raw_quad, start_date = "2022-11-17", end_date = "2023-04-09")

banff_dropzeros <- loess_log_fitter('banff', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
banff_dropzeros1 <- local_critpoint(banff_dropzeros, start_date = "2022-09-20", end_date = "2022-12-11")
banff_dropzeros2 <- local_critpoint(banff_dropzeros, start_date = "2022-11-13", end_date = "2023-02-12")

banff_complete <- list(banff_raw1, banff_raw2,
                       banff_raw3, banff_raw4,
                       banff_dropzeros1, banff_dropzeros2)

### brooks
# needs quality check
brooks <- loess_fitter('brooks', c(0.1,0.2,0.3))

brooks_raw_linear <- loess_log_fitter('brooks', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
brooks_raw1 <- local_critpoint(brooks_raw_linear, start_date = "2022-07-17", end_date = "2023-01-10")
brooks_raw2 <- local_critpoint(brooks_raw_linear, start_date = "2022-12-18", end_date = "2023-04-16")

brooks_raw_quad <- loess_log_fitter('brooks', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
brooks_raw3 <- local_critpoint(brooks_raw_quad, start_date = "2022-07-17", end_date = "2023-01-10")
brooks_raw4 <- local_critpoint(brooks_raw_quad, start_date = "2022-12-18", end_date = "2023-04-16")

brooks_dropzeros <- loess_log_fitter('brooks', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
brooks_dropzeros1 <- local_critpoint(brooks_dropzeros, start_date = "2022-06-01", end_date = "2023-01-01")
brooks_dropzeros2 <- local_critpoint(brooks_dropzeros, start_date = "2022-12-18", end_date = "2023-04-16")

brooks_complete <- list(brooks_raw1, brooks_raw2,
                        brooks_raw3, brooks_raw4,
                        brooks_dropzeros1, brooks_dropzeros2)

### calgary farsouth (pine creek wastewater treatment plant)
# how far back should the start day go?
calfarsouth <- loess_fitter('calgary far south', c(0.1,0.2,0.3))

calfarsouth_raw_linear <- loess_log_fitter('calgary far south', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
calfarsouth_raw1 <- local_critpoint(calfarsouth_raw_linear, start_date = "2022-06-12", end_date = "2023-01-01")
calfarsouth_raw2 <- local_critpoint(calfarsouth_raw_linear, start_date = "2022-11-12", end_date = "2023-05-05")

calfarsouth_raw_quad <- loess_log_fitter('calgary far south', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
calfarsouth_raw3 <- local_critpoint(calfarsouth_raw_quad, start_date = "2022-06-12", end_date = "2023-01-01")
calfarsouth_raw4 <- local_critpoint(calfarsouth_raw_quad, start_date = "2022-11-12", end_date = "2023-05-05")

calfarsouth_dropzeros <- loess_log_fitter('calgary far south', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
calfarsouth_dropzeros1 <- local_critpoint(calfarsouth_dropzeros, start_date = "2022-07-17", end_date = "2022-12-18")
calfarsouth_dropzeros2 <- local_critpoint(calfarsouth_dropzeros, start_date = "2022-11-20", end_date = "2023-04-23")

calfarsouth_complete <- list(calfarsouth_raw1, calfarsouth_raw2,
                             calfarsouth_raw3, calfarsouth_raw4,
                             calfarsouth_dropzeros1, calfarsouth_dropzeros2)

### calgary north (bonnybrook wastewater treatment plant)
# how far forward should the end date go?
calnorth <- loess_fitter('calgary north', c(0.1,0.2,0.3))

calnorth_raw_linear <- loess_log_fitter('calgary north', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
calnorth_raw1 <- local_critpoint(calnorth_raw_linear, start_date = "2022-08-10", end_date = "2023-01-15")
calnorth_raw2 <- local_critpoint(calnorth_raw_linear, start_date = "2022-11-27", end_date = "2023-05-07")

calnorth_raw_quad <- loess_log_fitter('calgary north', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
calnorth_raw3 <- local_critpoint(calnorth_raw_quad, start_date = "2022-08-10", end_date = "2023-01-15")
calnorth_raw4 <- local_critpoint(calnorth_raw_quad, start_date = "2022-11-27", end_date = "2023-05-07")

calnorth_dropzeros <- loess_log_fitter('calgary north', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
calnorth_dropzeros1 <- local_critpoint(calnorth_dropzeros, start_date = "2022-07-17", end_date = "2022-12-25")
calnorth_dropzeros2 <- local_critpoint(calnorth_dropzeros, start_date = "2022-11-13", end_date = "2023-04-16")

calnorth_complete <- list(calnorth_raw1, calnorth_raw2,
                          calnorth_raw3, calnorth_raw4,
                          calnorth_dropzeros1, calnorth_dropzeros2)

### calgary south (fish creek wastewater treatment plant)
calsouth <- loess_fitter('calgary south', c(0.1,0.2,0.3))

calsouth_raw_linear <- loess_log_fitter('calgary south', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
calsouth_raw1 <- local_critpoint(calsouth_raw_linear, start_date = "2022-07-24", end_date = "2022-12-25")
calsouth_raw2 <- local_critpoint(calsouth_raw_linear, start_date = "2022-11-13", end_date = "2023-04-30")

calsouth_raw_quad <- loess_log_fitter('calgary south', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
calsouth_raw3 <- local_critpoint(calsouth_raw_quad, start_date = "2022-07-24", end_date = "2022-12-25")
calsouth_raw4 <- local_critpoint(calsouth_raw_quad, start_date = "2022-11-13", end_date = "2023-04-30")

calsouth_dropzeros <- loess_log_fitter('calgary south', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
calsouth_dropzeros1 <- local_critpoint(calsouth_dropzeros, start_date = "2022-08-07", end_date = "2023-01-08")
calsouth_dropzeros2 <- local_critpoint(calsouth_dropzeros, start_date = "2022-11-13", end_date = "2023-04-16")

calsouth_complete <- list(calsouth_raw1, calsouth_raw2,
                          calsouth_raw3, calsouth_raw4,
                          calsouth_dropzeros1, calsouth_dropzeros2)

### canmore
canmore <- loess_fitter('canmore', c(0.1,0.2,0.3))

canmore_raw_linear <- loess_log_fitter('canmore', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
canmore_raw1 <- local_critpoint(canmore_raw_linear, start_date = "2022-07-03", end_date = "2023-01-01")
canmore_raw2 <- local_critpoint(canmore_raw_linear, start_date = "2022-11-23", end_date = "2023-04-23")

canmore_raw_quad <- loess_log_fitter('canmore', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
canmore_raw3 <- local_critpoint(canmore_raw_quad, start_date = "2022-07-03", end_date = "2023-01-01")
canmore_raw4 <- local_critpoint(canmore_raw_quad, start_date = "2022-11-23", end_date = "2023-04-23")

canmore_dropzeros <- loess_log_fitter('canmore', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
canmore_dropzeros1 <- local_critpoint(canmore_dropzeros, start_date = "2022-07-03", end_date = "2023-01-01")
canmore_dropzeros2 <- local_critpoint(canmore_dropzeros, start_date = "2022-11-23", end_date = "2023-04-23")

canmore_complete <- list(canmore_raw1, canmore_raw2,
                         canmore_raw3, canmore_raw4,
                         canmore_dropzeros1, canmore_dropzeros2)

### coldlake
coldlake <- loess_fitter('cold lake', c(0.1,0.2,0.3))

coldlake_raw_linear <- loess_log_fitter('cold lake', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
coldlake_raw1 <- local_critpoint(coldlake_raw_linear, start_date = "2022-09-11", end_date = "2022-12-18")
coldlake_raw2 <- local_critpoint(coldlake_raw_linear, start_date = "2022-11-13", end_date = "2023-03-12")

coldlake_raw_quad <- loess_log_fitter('cold lake', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
coldlake_raw3 <- local_critpoint(coldlake_raw_quad, start_date = "2022-09-11", end_date = "2022-12-18")
coldlake_raw4 <- local_critpoint(coldlake_raw_quad, start_date = "2022-11-13", end_date = "2023-03-12")

coldlake_dropzeros <- loess_log_fitter('cold lake', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
coldlake_dropzeros1 <- local_critpoint(coldlake_dropzeros, start_date = "2022-10-09", end_date = "2022-12-04")
coldlake_dropzeros2 <- local_critpoint(coldlake_dropzeros, start_date = "2022-11-13", end_date = "2023-01-08")

coldlake_complete <- list(coldlake_raw1, coldlake_raw2,
                          coldlake_raw3, coldlake_raw4,
                          coldlake_dropzeros1, coldlake_dropzeros2)

### drumheller
drumheller <- loess_fitter('drumheller', c(0.1,0.2,0.3))

drumheller_raw_linear <- loess_log_fitter('drumheller', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
drumheller_raw1 <- local_critpoint(drumheller_raw_linear, start_date = "2022-07-31", end_date = "2022-12-18")
drumheller_raw2 <- local_critpoint(drumheller_raw_linear, start_date = "2022-11-13", end_date = "2023-04-02")

drumheller_raw_quad <- loess_log_fitter('drumheller', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
drumheller_raw3 <- local_critpoint(drumheller_raw_quad, start_date = "2022-07-31", end_date = "2022-12-18")
drumheller_raw4 <- local_critpoint(drumheller_raw_quad, start_date = "2022-11-13", end_date = "2023-04-02")

drumheller_dropzeros <- loess_log_fitter('drumheller', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
drumheller_dropzeros1 <- local_critpoint(drumheller_dropzeros, start_date = "2022-07-31", end_date = "2022-12-18")
drumheller_dropzeros2 <- local_critpoint(drumheller_dropzeros, start_date = "2022-11-13", end_date = "2023-03-19")

drumheller_complete <- list(drumheller_raw1, drumheller_raw2,
                            drumheller_raw3, drumheller_raw4,
                            drumheller_dropzeros1, drumheller_dropzeros2)

### edmonton
edmonton <- loess_fitter('edmonton', c(0.1,0.2,0.3))

edmonton_raw_linear <- loess_log_fitter('edmonton', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
edmonton_raw1 <- local_critpoint(edmonton_raw_linear, start_date = "2022-07-31", end_date = "2022-12-18")
edmonton_raw2 <- local_critpoint(edmonton_raw_linear, start_date = "2022-11-13", end_date = "2023-05-14")

edmonton_raw_quad <- loess_log_fitter('edmonton', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
edmonton_raw3 <- local_critpoint(edmonton_raw_quad, start_date = "2022-07-31", end_date = "2022-12-18")
edmonton_raw4 <- local_critpoint(edmonton_raw_quad, start_date = "2022-11-13", end_date = "2023-05-14")

edmonton_dropzeros <- loess_log_fitter('edmonton', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
edmonton_dropzeros1 <- local_critpoint(edmonton_dropzeros, start_date = "2022-06-12", end_date = "2022-12-04")
edmonton_dropzeros2 <- local_critpoint(edmonton_dropzeros, start_date = "2022-11-13", end_date = "2023-04-30")

edmonton_complete <- list(edmonton_raw1, edmonton_raw2,
                          edmonton_raw3, edmonton_raw4,
                          edmonton_dropzeros1, edmonton_dropzeros2)

### edson
edson <- loess_fitter('edson', c(0.1,0.2,0.3))

edson_raw_linear <- loess_log_fitter('edson', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
edson_raw1 <- local_critpoint(edson_raw_linear, start_date = "2022-08-14", end_date = "2022-12-11")
edson_raw2 <- local_critpoint(edson_raw_linear, start_date = "2022-11-13", end_date = "2023-04-02")

edson_raw_quad <- loess_log_fitter('edson', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
edson_raw3 <- local_critpoint(edson_raw_quad, start_date = "2022-08-14", end_date = "2022-12-11")
edson_raw4 <- local_critpoint(edson_raw_quad, start_date = "2022-11-13", end_date = "2023-04-02")

edson_dropzeros <- loess_log_fitter('edson', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
edson_dropzeros1 <- local_critpoint(edson_dropzeros, start_date = "2022-09-11", end_date = "2022-12-11")
edson_dropzeros2 <- local_critpoint(edson_dropzeros, start_date = "2022-11-20", end_date = "2023-04-02")

edson_complete <- list(edson_raw1, edson_raw2,
                       edson_raw3, edson_raw4,
                       edson_dropzeros1, edson_dropzeros2)

### fort mcmurray
fortmc <- loess_fitter('fort mcmurray', c(0.1,0.2,0.3))

fortmc_raw_linear <- loess_log_fitter('fort mcmurray', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
fortmc_raw1 <- local_critpoint(fortmc_raw_linear, start_date = "2022-08-07", end_date = "2022-12-25")
fortmc_raw2 <- local_critpoint(fortmc_raw_linear, start_date = "2022-11-06", end_date = "2023-04-09")

fortmc_raw_quad <- loess_log_fitter('fort mcmurray', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
fortmc_raw3 <- local_critpoint(fortmc_raw_quad, start_date = "2022-08-07", end_date = "2022-12-25")
fortmc_raw4 <- local_critpoint(fortmc_raw_quad, start_date = "2022-11-06", end_date = "2023-04-09")

fortmc_dropzeros <- loess_log_fitter('fort mcmurray', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
fortmc_dropzeros1 <- local_critpoint(fortmc_dropzeros, start_date = "2022-08-14", end_date = "2022-12-25")
fortmc_dropzeros2 <- local_critpoint(fortmc_dropzeros, start_date = "2022-11-06", end_date = "2023-04-09")

fortmc_complete <- list(fortmc_raw1, fortmc_raw2,
                        fortmc_raw3, fortmc_raw4,
                        fortmc_dropzeros1, fortmc_dropzeros2)

### fort saskatchewan
fortsask <- loess_fitter('fort saskatchewan', c(0.1,0.2,0.3))

fortsask_raw_linear <- loess_log_fitter('fort saskatchewan', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
fortsask_raw1 <- local_critpoint(fortsask_raw_linear, start_date = "2022-08-01", end_date = "2022-12-04") 
fortsask_raw2 <- local_critpoint(fortsask_raw_linear, start_date = "2022-11-06", end_date = "2023-04-09")

fortsask_raw_quad <- loess_log_fitter('fort saskatchewan', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
fortsask_raw3 <- local_critpoint(fortsask_raw_quad, start_date = "2022-08-01", end_date = "2022-12-04") 
fortsask_raw4 <- local_critpoint(fortsask_raw_quad, start_date = "2022-11-06", end_date = "2023-04-09")

fortsask_dropzeros <- loess_log_fitter('fort saskatchewan', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
fortsask_dropzeros1 <- local_critpoint(fortsask_dropzeros, start_date = "2022-07-10", end_date = "2022-12-11")
fortsask_dropzeros2 <- local_critpoint(fortsask_dropzeros, start_date = "2022-11-13", end_date = "2023-04-16")

fortsask_complete <- list(fortsask_raw1, fortsask_raw2,
                          fortsask_raw3, fortsask_raw4,
                          fortsask_dropzeros1, fortsask_dropzeros2)

### grande prairie
grande <- loess_fitter('grande prairie', c(0.1,0.2,0.3))

grande_raw_linear <- loess_log_fitter('grande prairie', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
grande_raw1 <- local_critpoint(grande_raw_linear, start_date = "2022-08-07", end_date = "2022-12-18")
grande_raw2 <- local_critpoint(grande_raw_linear, start_date = "2022-11-13", end_date = "2023-04-16")

grande_raw_quad <- loess_log_fitter('grande prairie', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
grande_raw3 <- local_critpoint(grande_raw_quad, start_date = "2022-08-07", end_date = "2022-12-18")
grande_raw4 <- local_critpoint(grande_raw_quad, start_date = "2022-11-13", end_date = "2023-04-16")

grande_dropzeros <- loess_log_fitter('grande prairie', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
grande_dropzeros1 <- local_critpoint(grande_dropzeros, start_date = "2022-10-09", end_date = "2022-11-27")
grande_dropzeros2 <- local_critpoint(grande_dropzeros, start_date = "2022-11-13", end_date = "2023-04-23")

grande_complete <- list(grande_raw1, grande_raw2,
                        grande_raw3, grande_raw4,
                        grande_dropzeros1, grande_dropzeros2)

### high river
highriver <- loess_fitter('high river', c(0.1,0.2,0.3))

highriver_raw_linear <- loess_log_fitter('high river', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
highriver_raw1 <- local_critpoint(highriver_raw_linear, start_date = "2022-10-02", end_date = "2022-12-04")
highriver_raw2 <- local_critpoint(highriver_raw_linear, start_date = "2022-11-13", end_date = "2022-12-25")

highriver_raw_quad <- loess_log_fitter('high river', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
highriver_raw3 <- local_critpoint(highriver_raw_quad, start_date = "2022-10-02", end_date = "2022-12-04")
highriver_raw4 <- local_critpoint(highriver_raw_quad, start_date = "2022-11-13", end_date = "2022-12-25")

highriver_dropzeros <- loess_log_fitter('high river', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
highriver_dropzeros1 <- local_critpoint(highriver_dropzeros, start_date = "2022-10-18", end_date = "2022-12-04")
highriver_dropzeros2 <- local_critpoint(highriver_dropzeros, start_date = "2022-11-20", end_date = "2023-01-01")

highriver_complete <- list(highriver_raw1, highriver_raw2,
                           highriver_raw3, highriver_raw4,
                           highriver_dropzeros1, highriver_dropzeros2)

### jasper
jasper <- loess_fitter('jasper', c(0.1,0.2,0.3))

jasper_raw_linear <- loess_log_fitter('jasper', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
jasper_raw1 <- local_critpoint(jasper_raw_linear, start_date = "2022-08-28", end_date = "2022-12-25")
jasper_raw2 <- local_critpoint(jasper_raw_linear, start_date = "2022-11-27", end_date = "2023-05-21")

jasper_raw_quad <- loess_log_fitter('jasper', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
jasper_raw3 <- local_critpoint(jasper_raw_quad, start_date = "2022-08-28", end_date = "2022-12-25")
jasper_raw4 <- local_critpoint(jasper_raw_quad, start_date = "2022-11-27", end_date = "2023-05-21")

jasper_dropzeros <- loess_log_fitter('jasper', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
jasper_dropzeros1 <- local_critpoint(jasper_dropzeros, start_date = "2022-09-25", end_date = "2022-12-25")
jasper_dropzeros2 <- local_critpoint(jasper_dropzeros, start_date = "2022-11-13", end_date = "2023-05-27")

jasper_complete <- list(jasper_raw1, jasper_raw2,
                        jasper_raw3, jasper_raw4,
                        jasper_dropzeros1, jasper_dropzeros2)

### lacombe
lacombe <- loess_fitter('lacombe', c(0.1,0.2,0.3))

lacombe_raw_linear <- loess_log_fitter('lacombe', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
lacombe_raw1 <- local_critpoint(lacombe_raw_linear, start_date = "2022-08-07", end_date = "2022-12-25")
lacombe_raw2 <- local_critpoint(lacombe_raw_linear, start_date = "2022-11-20", end_date = "2023-03-05")

lacombe_raw_quad <- loess_log_fitter('lacombe', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
lacombe_raw3 <- local_critpoint(lacombe_raw_quad, start_date = "2022-08-07", end_date = "2022-12-25")
lacombe_raw4 <- local_critpoint(lacombe_raw_quad, start_date = "2022-11-20", end_date = "2023-03-05")

lacombe_dropzeros <- loess_log_fitter('lacombe', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
lacombe_dropzeros1 <- local_critpoint(lacombe_dropzeros, start_date = "2022-07-31", end_date = "2022-12-25")
lacombe_dropzeros2 <- local_critpoint(lacombe_dropzeros, start_date = "2022-11-20", end_date = "2023-03-12")

lacombe_complete <- list(lacombe_raw1, lacombe_raw2,
                         lacombe_raw3, lacombe_raw4,
                         lacombe_dropzeros1, lacombe_dropzeros2)

### lethbridge
lethbridge <- loess_fitter('lethbridge', c(0.1,0.2,0.3))

lethbridge_raw_linear <- loess_log_fitter('lethbridge', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
lethbridge_raw1 <- local_critpoint(lethbridge_raw_linear, start_date = "2022-09-11", end_date = "2023-01-01")
lethbridge_raw2 <- local_critpoint(lethbridge_raw_linear, start_date = "2022-11-27", end_date = "2023-05-07")

lethbridge_raw_quad <- loess_log_fitter('lethbridge', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
lethbridge_raw3 <- local_critpoint(lethbridge_raw_quad, start_date = "2022-09-11", end_date = "2023-01-01")
lethbridge_raw4 <- local_critpoint(lethbridge_raw_quad, start_date = "2022-11-27", end_date = "2023-05-07")

lethbridge_dropzeros <- loess_log_fitter('lethbridge', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
lethbridge_dropzeros1 <- local_critpoint(lethbridge_dropzeros, start_date = "2022-10-23", end_date = "2022-12-18")
lethbridge_dropzeros2 <- local_critpoint(lethbridge_dropzeros, start_date = "2022-11-13", end_date = "2023-02-12")

lethbridge_complete <- list(lethbridge_raw1, lethbridge_raw2,
                            lethbridge_raw3, lethbridge_raw4,
                            lethbridge_dropzeros1, lethbridge_dropzeros2)

### medicine hat
medicine <- loess_fitter('medicine hat', c(0.1,0.2,0.3))

medicine_raw_linear <- loess_log_fitter('medicine hat', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
medicine_raw1 <- local_critpoint(medicine_raw_linear, start_date = "2022-08-07", end_date = "2022-12-18")
medicine_raw2 <- local_critpoint(medicine_raw_linear, start_date = "2022-11-26", end_date = "2023-04-23")

medicine_raw_quad <- loess_log_fitter('medicine hat', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
medicine_raw3 <- local_critpoint(medicine_raw_quad, start_date = "2022-08-07", end_date = "2022-12-18")
medicine_raw4 <- local_critpoint(medicine_raw_quad, start_date = "2022-11-26", end_date = "2023-04-23")

medicine_dropzeros <- loess_log_fitter('medicine hat', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
medicine_dropzeros1 <- local_critpoint(medicine_dropzeros, start_date = "2022-10-09", end_date = "2022-12-04")
medicine_dropzeros2 <- local_critpoint(medicine_dropzeros, start_date = "2022-11-06", end_date = "2023-02-12")

medicine_complete <- list(medicine_raw1, medicine_raw2,
                          medicine_raw3, medicine_raw4,
                          medicine_dropzeros1, medicine_dropzeros2)

### okotoks
okotoks <- loess_fitter('okotoks', c(0.1,0.2,0.3))

okotoks_raw_linear <- loess_log_fitter('okotoks', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
okotoks_raw1 <- local_critpoint(okotoks_raw_linear, start_date = "2022-07-17", end_date = "2022-12-11")
okotoks_raw2 <- local_critpoint(okotoks_raw_linear, start_date = "2022-11-06", end_date = "2023-04-16")

okotoks_raw_quad <- loess_log_fitter('okotoks', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
okotoks_raw3 <- local_critpoint(okotoks_raw_quad, start_date = "2022-07-17", end_date = "2022-12-11")
okotoks_raw4 <- local_critpoint(okotoks_raw_quad, start_date = "2022-11-06", end_date = "2023-04-16")

okotoks_dropzeros <- loess_log_fitter('okotoks', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
okotoks_dropzeros1 <- local_critpoint(okotoks_dropzeros, start_date = "2022-07-03", end_date = "2022-12-11")
okotoks_dropzeros2 <- local_critpoint(okotoks_dropzeros, start_date = "2022-11-06", end_date = "2023-04-02")

okotoks_complete <- list(okotoks_raw1, okotoks_raw2,
                         okotoks_raw3, okotoks_raw4,
                         okotoks_dropzeros1, okotoks_dropzeros2)

### red deer
reddeer <- loess_fitter('red deer', c(0.1,0.2,0.3))

reddeer_raw_linear <- loess_log_fitter('red deer', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
reddeer_raw1 <- local_critpoint(reddeer_raw_linear, start_date = "2022-08-14", end_date = "2022-12-25")
reddeer_raw2 <- local_critpoint(reddeer_raw_linear, start_date = "2022-11-27", end_date = "2023-07-02")

reddeer_raw_quad <- loess_log_fitter('red deer', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
reddeer_raw3 <- local_critpoint(reddeer_raw_quad, start_date = "2022-08-14", end_date = "2022-12-25")
reddeer_raw4 <- local_critpoint(reddeer_raw_quad, start_date = "2022-11-27", end_date = "2023-07-02")

reddeer_dropzeros <- loess_log_fitter('red deer', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
reddeer_dropzeros1 <- local_critpoint(reddeer_dropzeros, start_date = "2022-07-17", end_date = "2022-12-11")
reddeer_dropzeros2 <- local_critpoint(reddeer_dropzeros, start_date = "2022-11-20", end_date = "2023-01-29")

reddeer_complete <- list(reddeer_raw1, reddeer_raw2,
                         reddeer_raw3, reddeer_raw4,
                         reddeer_dropzeros1, reddeer_dropzeros2)

### strathmore
strathmore <- loess_fitter('strathmore', c(0.1,0.2,0.3))

strathmore_raw_linear <- loess_log_fitter('strathmore', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
strathmore_raw1 <- local_critpoint(strathmore_raw_linear, start_date = "2022-08-14", end_date = "2022-12-25")
strathmore_raw2 <- local_critpoint(strathmore_raw_linear, start_date = "2022-11-06", end_date = "2023-05-21")

strathmore_raw_quad <- loess_log_fitter('strathmore', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
strathmore_raw3 <- local_critpoint(strathmore_raw_quad, start_date = "2022-08-14", end_date = "2022-12-25")
strathmore_raw4 <- local_critpoint(strathmore_raw_quad, start_date = "2022-11-06", end_date = "2023-05-21")

strathmore_dropzeros <- loess_log_fitter('strathmore', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
strathmore_dropzeros1 <- local_critpoint(strathmore_dropzeros, start_date = "2022-08-14", end_date = "2022-12-25")
strathmore_dropzeros2 <- local_critpoint(strathmore_dropzeros, start_date = "2022-11-06", end_date = "2023-04-09")

strathmore_complete <- list(strathmore_raw1, strathmore_raw2,
                            strathmore_raw3, strathmore_raw4,
                            strathmore_dropzeros1, strathmore_dropzeros2)

### taber
taber <- loess_fitter('taber', c(0.1,0.2,0.3))

taber_raw_linear <- loess_log_fitter('taber', c(0.1,0.2,0.3), degree = 1, local_min = TRUE)
taber_raw1 <- local_critpoint(taber_raw_linear, start_date = "2022-07-24", end_date = "2023-01-15")
taber_raw2 <- local_critpoint(taber_raw_linear, start_date = "2022-12-04", end_date = "2023-04-16")

taber_raw_quad <- loess_log_fitter('taber', c(0.1,0.15,0.2,0.25,0.3), degree = 2, local_min = TRUE)
taber_raw3 <- local_critpoint(taber_raw_quad, start_date = "2022-07-24", end_date = "2023-01-15")
taber_raw4 <- local_critpoint(taber_raw_quad, start_date = "2022-12-04", end_date = "2023-04-16")

taber_dropzeros <- loess_log_fitter('taber', c(0.1,0.2,0.3), degree = 1, drop_zeros = TRUE, local_min = TRUE)
taber_dropzeros1 <- local_critpoint(taber_dropzeros, start_date = "2022-06-26", end_date = "2023-01-15")
taber_dropzeros2 <- local_critpoint(taber_dropzeros, start_date = "2022-12-04", end_date = "2023-04-16")

taber_complete <- list(taber_raw1, taber_raw2,
                       taber_raw3, taber_raw4,
                       taber_dropzeros1, taber_dropzeros2)

# collect the raw data plots
sites_flu_plots <- list("airdrie" = airdrie, "banff" = banff,
                  "brooks" = brooks, "calgary north" = calnorth,
                  "calgary south" = calsouth, "calgary far south" = calfarsouth,
                  "canmore" = canmore, "cold lake" = coldlake,
                  "drumheller" = drumheller, "edmonton" = edmonton,
                  "edson" = edson, "fort mcmurray" = fortmc,
                  "fort saskatchewan" = fortsask, "grande prairie" = grande,
                  "high river" = highriver, "jasper" = jasper,
                  "lacombe" = lacombe, "lethbridge" = lethbridge,
                  "medicine hat" = medicine, "okotoks" = okotoks,
                  "red deer" = reddeer, "strathmore" = strathmore,
                  "taber" = taber)

for (name in names(sites_flu_plots)) {
  p <- sites_flu_plots[[name]]
  ggsave(
    filename = paste0('plots/2022_flu_season_presentation/', name, '_plot.jpeg'),
    plot = p,
    width = 10,
    height = 6,
    dpi = 300
  )
}

# collect raw plots of degree = 1
sites_raw_linear <- list("airdrie" = airdrie_raw_linear, "banff" = banff_raw_linear,
                  "brooks" = brooks_raw_linear, "calgary north" = calnorth_raw_linear,
                  "calgary south" = calsouth_raw_linear, "calgary far south" = calfarsouth_raw_linear,
                  "canmore" = canmore_raw_linear, "cold lake" = coldlake_raw_linear,
                  "drumheller" = drumheller_raw_linear, "edmonton" = edmonton_raw_linear,
                  "edson" = edson_raw_linear, "fort mcmurray" = fortmc_raw_linear,
                  "fort saskatchewan" = fortsask_raw_linear, "grande prairie" = grande_raw_linear,
                  "high river" = highriver_raw_linear, "jasper" = jasper_raw_linear,
                  "lacombe" = lacombe_raw_linear, "lethbridge" = lethbridge_raw_linear,
                  "medicine hat" = medicine_raw_linear, "okotoks" = okotoks_raw_linear,
                  "red deer" = reddeer_raw_linear, "strathmore" = strathmore_raw_linear,
                  "taber" = taber_raw_linear)

# save the raw plots
for (name in names(sites_raw_linear)) {
  p <- sites_raw_linear[[name]]$plot
  ggsave(
    filename = paste0('plots/2022_flu_season_spans_1-15-2/', name, '_linear_loess_plot.jpeg'),
    plot = p,
    width = 10,
    height = 6,
    dpi = 300
  )
}

# collect raw plots of degree = 2
sites_raw_quad <- list("airdrie" = airdrie_raw_quad, "banff" = banff_raw_quad,
                         "brooks" = brooks_raw_quad, "calgary north" = calnorth_raw_quad,
                         "calgary south" = calsouth_raw_quad, "calgary far south" = calfarsouth_raw_quad,
                         "canmore" = canmore_raw_quad, "cold lake" = coldlake_raw_quad,
                         "drumheller" = drumheller_raw_quad, "edmonton" = edmonton_raw_quad,
                         "edson" = edson_raw_quad, "fort mcmurray" = fortmc_raw_quad,
                         "fort saskatchewan" = fortsask_raw_quad, "grande prairie" = grande_raw_quad,
                         "high river" = highriver_raw_quad, "jasper" = jasper_raw_quad,
                         "lacombe" = lacombe_raw_quad, "lethbridge" = lethbridge_raw_quad,
                         "medicine hat" = medicine_raw_quad, "okotoks" = okotoks_raw_quad,
                         "red deer" = reddeer_raw_quad, "strathmore" = strathmore_raw_quad,
                         "taber" = taber_raw_quad)

# save the raw quad plots
for (name in names(sites_raw_quad)) {
  p <- sites_raw_quad[[name]]$plot
  ggsave(
    filename = paste0('plots/2022_flu_season_spans_1-2-3/', name, '_quad_loess_plot.jpeg'),
    plot = p,
    width = 10,
    height = 6,
    dpi = 300
  )
}

# stack dataframes from all quadratic loess fits
all_df <- list()

for (name in names(sites_raw_quad)) {
  df <- sites_raw_quad[[name]]$df
  df$site <- name
  all_df[[name]] <- df
}
all_merged_quad_df <- bind_rows(all_df)
write.xlsx(all_merged_quad_df, file = 'alberta_flu_QUAD-loess_2022.xlsx')

sites_complete_objects <- list("airdrie" = airdrie_complete, "banff" = banff_complete,
                       "brooks" = brooks_complete, "calgary north" = calnorth_complete,
                       "calgary south" = calsouth_complete, "calgary far south" = calfarsouth_complete,
                       "canmore" = canmore_complete, "cold lake" = coldlake_complete,
                       "drumheller" = drumheller_complete, "edmonton" = edmonton_complete,
                       "edson" = edson_complete, "fort mcmurray" = fortmc_complete,
                       "fort saskatchewan" = fortsask_complete, "grande prairie" = grande_complete,
                       "high river" = highriver_complete, "jasper" = jasper_complete,
                       "lacombe" = lacombe_complete, "lethbridge" = lethbridge_complete,
                       "medicine hat" = medicine_complete, "okotoks" = okotoks_complete,
                       "red deer" = reddeer_complete, "strathmore" = strathmore_complete,
                       "taber" = taber_complete)

sites_complete_summaries <- lapply(sites_complete_objects, function(site_list) {
  lapply(site_list, `[[`, "summary")
})

summarise_season_phases <- function(complete_list) {
  names(complete_list) <- c("raw_onset", "raw_end",
                            "raw_onset_deg2", "raw_end_deg2",
                            "dropzeros_onset", "dropzeros_end")
  
  combined <- bind_rows(
    complete_list$raw_onset       %>% mutate(season_phase = "onset"),
    complete_list$raw_end         %>% mutate(season_phase = "end"),
    
    complete_list$raw_onset_deg2  %>% mutate(season_phase = "onset"),
    complete_list$raw_end_deg2    %>% mutate(season_phase = "end"),
    
    complete_list$dropzeros_onset %>% mutate(season_phase = "onset"),
    complete_list$dropzeros_end   %>% mutate(season_phase = "end")
  )  
  
  combined %>% 
    group_by(site, drop_zeros, span, degree) %>% 
    summarise(
      start_value_log = min_value[season_phase == "onset"],
      start_value_exact = 10 ^ start_value_log,
      start_date = min_date[season_phase == "onset"],
      start_epiweek = min_epiweek[season_phase == "onset"],
      peak_value_log = max_value[1],
      peak_value_exact = 10 ^ peak_value_log,
      peak_date = max_date[1],
      peak_epiweek = max_epiweek[1],
      end_value_log = min_value[season_phase == "end"],
      end_value_exact = 10 ^ end_value_log,
      end_date = min_date[season_phase == "end"],
      end_epiweek = min_epiweek[season_phase == "end"],
      .groups = "drop"
    )
}

summary_process <- function(all_sites_complete) {
  result <- mapply(
    FUN = function(site_list, site_name) {
      df <- summarise_season_phases(site_list)
      df$site <- site_name
      df
    },
    site_list = all_sites_complete,
    site_name = names(all_sites_complete),
    SIMPLIFY = FALSE
  )
  
  return(bind_rows(result))
}

all_sites_summary <- summary_process(sites_complete_summaries)

for (site in unique(json_data$site)) {
  print(site[1])
}
write.xlsx(all_sites_summary, file = "alberta_flu_characteristics.xlsx")

ggsave(
  filename = "plots/airdrie_all_spans.jpeg",
  plot = airdrie_raw_quad$plot,
  width = 10,
  height = 6,
  dpi = 300
)
