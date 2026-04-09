library(tidyverse)
library(lubridate)
library(readxl)
library(openxlsx)
library(scales)

# load the JSON file
json_data <- read_excel('alberta_flu_rawdata.xlsx')
json_data$date <- as.Date(json_data$date)
# group the rawdata by site
sites <- json_data %>% group_split(site)

# convert the calgary wastewater plant names into north, south, far south
# Calgary North = Bonnybrook, Calgary South = Fish Creek and Calgary Far South = Pine Creek
json_data <- json_data %>% 
  mutate(site = case_when(
    site == 'bonnybrook wastewater treatment plant' ~ 'calgary north',
    site == 'fish creek wastewater treatment plant' ~ 'calgary south',
    site == 'pine creek wastewater treatment plant' ~ 'calgary far south',
    TRUE ~ site
  )) %>% arrange(site)

# find the smallest non-zero value across the entire dataset
min_value <- min(json_data$exact_read[json_data$exact_read > 0])

# standardize the dates for epiweeks
min_date <- min(json_data$date)
max_date <- max(json_data$date)
epiweek_start <- seq(from = floor_date(min_date, "week", week_start = 7),
                     to = max_date,
                     by = "1 week")

# take log10 of the exact_read columns after adjusting zero values
json_data <- json_data %>% 
  mutate(
#### replace 0 exact reads with global minimum non-zero value
    exact_read_nonzero_global = if_else(exact_read == 0, min_value, exact_read),
    exact_log10 = log10(exact_read_nonzero_global)
  )

# split the json file into a tibble of dataframes
sites_tibbles <- json_data %>% 
  group_by(site) %>% 
  group_split(site)

# give the original site names to each item in the tibble
site_names <- map_chr(sites_tibbles, ~ unique(.x$site))
sites_tibbles <- set_names(sites_tibbles, site_names)
sites_dataframes <- lapply(sites_tibbles, as.data.frame)

#### replace 0 exact reads with a minimum non-zero value in each site
for (i in seq_along(sites_dataframes)) {
  df <- sites_dataframes[[i]]
  df_filtered <- df %>% filter(exact_read > 0)
  min_site_value <- min(df_filtered$exact_read)
  print(paste(names(sites_tibbles)[i], ":", min_site_value))
  df <- df %>% mutate(
    exact_read_nonzero_site = if_else(
      exact_read == 0,
      as.numeric(min_site_value),
      exact_read),
    exact_log10_site = log10(exact_read_nonzero_site)
  )
  sites_dataframes[[i]] <- df
}

# name function for capitalizing Fort McMurray
fix_mcmurray <- function(name) {
  if (tolower(name) == "fort mcmurray") {
    return("Fort McMurray")
  }
  else {
    return(tools::toTitleCase(name))
  }  
}

#### function to apply a quadratic loess fit
loess_fitter <- function(site, span_vals) {
  df <- sites_dataframes[[as.character(site)]]
  
  # initiate empty list
  fits_list <- list()
  
  for (span in span_vals) {
    fit <- loess(exact_read ~ as.numeric(date),
                 data = df,
                 degree = 2,
                 span = span)
    pred <- predict(fit, se = TRUE)
    
    # create individual tibbles for each site with each span
    fits_list[[as.character(span)]] <- tibble(
      date = df$date,
      epi_week = df$epi_week,
      exact_read = df$exact_read,
      exact_log10 = df$exact_log10,
      sd = df$sd,
      fit = pred$fit,
      se = pred$se.fit,
      upper = pred$fit + 1.96 * pred$se.fit,
      lower = pred$fit - 1.96 * pred$se.fit,
      span = factor(span)
    )
  }
  
  # stack the rows
  plot_df <- bind_rows(fits_list)
  
  # plot
  p <- ggplot(plot_df, aes(x = date)) +
    geom_ribbon(aes(ymin = lower, ymax = upper, fill = span), alpha = 0.15) +
    geom_line(aes(y = fit, color = span), size = 0.75) +
    geom_errorbar(aes(
      ymin = exact_read - 1.96 * sd,
      ymax = exact_read + 1.96 * sd),
      width = 0.2,
      color = 'darkgrey',
      size = 0.5) +
    geom_point(aes(y = exact_read), color = 'black', size = 1, alpha = 1) +
    geom_point(data=subset(plot_df, sd == 0),
               aes(x = date, y = exact_read),
               color = 'white', size = 0.5) +
    scale_color_brewer(palette = "Set1") +
    scale_fill_brewer(palette = "Set1") +
    labs(
      title = paste(
        fix_mcmurray(site), 'Quadratic LOESS Fit with 95% CI'),
      x = 'Date',
      y = 'Influenza A gc/mL Wastewater',
      color = 'Span',
      fill = 'Span') +
    theme_minimal() +
    scale_x_date(
      breaks = epiweek_start,
      limits = as.Date(c('2022-05-01','2023-09-01')),
      labels = function(d) format(d, "%b %d"),
      sec.axis = dup_axis(
        labels = function(d) epiweek(d),
        name = 'Epi Week'
      )) +
    theme(axis.text.x = element_text(angle=90, vjust=0.5),
          axis.text.x.top = element_text(angle=90, vjust=0.5))
  
  print(p)
  return(p)
}

#### function to apply linear loess fit to log-transformed data
loess_log_fitter <- function(site, span_vals, degree, drop_zeros=FALSE, local_min=FALSE) {
  df <- sites_dataframes[[as.character(site)]]
  title_text = ''
  if (drop_zeros) {
    df <- df %>% filter(exact_read != 0) # remove rows that had exact_read=0
    title_text = '(with dropped zeros)'
  }
  
  if (degree == 1) {
    method_text = 'Linear'
  } else {
    method_text = 'Quadratic'
  }
  
  # initiate empty list
  fits_list <- list()
  
  for (span in span_vals) {
    fit <- loess(
      formula = (if (local_min) exact_log10_site else exact_log10) ~ as.numeric(date),
      data = df,
      degree = degree,
      span = span)
    pred <- predict(fit, se = TRUE)
  
    fits_list[[as.character(span)]] <- tibble(
      site = site,
      date = df$date,
      epi_week = df$epi_week,
      exact_read = df$exact_read,
      exact_log10 = df$exact_log10,
      exact_log10_site = df$exact_log10_site,
      sd = df$sd,
      fit = pred$fit,
      se = pred$se.fit,
      upper = pred$fit + 1.96 * pred$se.fit,
      lower = pred$fit - 1.96 * pred$se.fit,
      span = factor(span) # helps with coloring
    )
  }
  
  # stack the rows
  plot_df <- bind_rows(fits_list)
  print(plot_df)
  # plot
  p <- ggplot(plot_df, aes(x = date)) +
    geom_ribbon(aes(ymin = lower, ymax = upper, fill = span), alpha = 0.15) +
    geom_line(aes(y = fit, color = span), size = 0.75) +
    scale_color_brewer(palette = "Set1") +
    scale_fill_brewer(palette = "Set1") +
    labs(
      title = paste(
        fix_mcmurray(site), 'Log-transformed', method_text, 'LOESS Fit', title_text),
      x = 'Date',
      y = 'Log(Influenza A gc/mL Wastewater)',
      color = 'Span',
      fill = 'Span') +
    theme_minimal() +
    scale_x_date(
      breaks = epiweek_start,
      limits = as.Date(c('2022-05-01','2023-09-01')),
      labels = function(d) format(d, "%b %d"),
      sec.axis = dup_axis(
        labels = function(d) epiweek(d),
        name = 'Epi Week'
      )) +
    theme(axis.text.x = element_text(angle=90, vjust=0.5),
          axis.text.x.top = element_text(angle=90, vjust=0.5))
  
  if (local_min) {
    p <- p + geom_point(aes(y = exact_log10_site), color = 'black', size = 1, alpha = 1) +
      geom_point(data=subset(plot_df, sd == 0),
                 aes(x = date, y = exact_log10_site),
                 color = 'black', size = 1) +
      geom_point(data=subset(plot_df, sd == 0),
                 aes(x = date, y = exact_log10_site),
                 color = 'white', size = 0.5)
  } else {
    p <- p + geom_point(aes(y = exact_log10), color = 'black', size = 1, alpha = 1) +
      geom_point(data=subset(plot_df, sd == 0),
               aes(x = date, y = exact_log10),
               color = 'black', size = 1) +
      geom_point(data=subset(plot_df, sd == 0),
                 aes(x = date, y = exact_log10),
                 color = 'white', size = 0.5)
  }
  
  print(p)
  
  return(list(
    plot = p,
    drop_zeros = drop_zeros,
    degree = degree,
    site = site,
    df = plot_df))
}

#### function to retrieve the critical points of the previous loess_log_fitter
local_critpoint <- function(plot_object, start_date, end_date) {
  df <- plot_object$plot$data
  span_vals <- unique(df$span)
  drop_zeros <- plot_object$drop_zeros
  degree <- plot_object$degree
  
  fits_list <- list()
  
  for (i in span_vals) {
    # filter based on each span in the plot object
    # ensure df is arranged by date
    df_span <- df %>% filter(span == i)
    df_span <- df_span %>% arrange(date)
    
    # generate daily sequence for entire full date range
    all_dates <- seq((min(df_span$date)), (max(df_span$date)), by = '1 day')
    
    # linearly interpolate the existing LOESS values
    daily_fit <- approx(
      x = as.numeric(df_span$date),
      y = df_span$fit,
      xout = as.numeric(all_dates)
    )$y
    
    # convert the new fit and date-predictions into a tibble
    pred_tibble <- tibble(
      date = all_dates,
      pred = daily_fit,
      epi_week = format(all_dates, "%U")
    ) %>% 
      filter(date >= as.Date(start_date),
             date <= as.Date(end_date))
    
    # store the results from the date-filtered pred_tibble
    fits_list[[as.character(i)]] <- tibble(
      site = plot_object$site,
      drop_zeros = drop_zeros,
      degree = degree,
      span = i,
      max_value = max(pred_tibble$pred),
      max_date = pred_tibble$date[which.max(pred_tibble$pred)],
      max_epiweek = pred_tibble$epi_week[which.max(pred_tibble$pred)],
      min_value = min(pred_tibble$pred),
      min_date = pred_tibble$date[which.min(pred_tibble$pred)],
      min_epiweek = pred_tibble$epi_week[which.min(pred_tibble$pred)]
    )
  }
  
  summary = data.frame(bind_rows(fits_list))
  
  print(summary)
  
  # function returns elements to be used in the next step
  return(list(
    summary = summary,
    data = df,
    drop_zeros = drop_zeros,
    span_vals = span_vals)
  )
}

flu_growth_rate <- function(plot_object, site_name, dropped_zeros = FALSE) {
  # retrieve data from the plot object
  df <- plot_object$data
  summary <- plot_object$summary
  span_vals <- plot_object$span_vals
  site_name = as.character(site_name)
  title_text = if_else(!dropped_zeros, '', '[with dropped zeros]', missing = '')
  
  # initialize return list
  results <- list()
  
  for (i in span_vals) {
    date_info <- summary %>% filter(span == i)
    
    min_date <- date_info$min_date
    max_date <- date_info$max_date
    
    df_filtered <- df %>% filter(date >= min_date,
                                 date <= max_date,
                                 span == i)
    span_text = as.character(i)
    
    model <- lm(exact_log10 ~ as.numeric(date), data = df_filtered)
    slope <- coef(model)[2]
  
    p <- ggplot(df_filtered, aes(x = date, y = exact_log10)) +
      geom_point(data = df_filtered, aes(x = date, y = exact_log10), color = 'darkblue',
                 shape = 1, size = 2) +
      geom_smooth(method = 'lm', se = FALSE) +
      labs(title = paste(fix_mcmurray(site_name),
                         'Linear Regression of Log-transformed Data, Span =', span_text,
                         title_text),
           x = "Date",
           y = "Log(Influenza A gc/mL Wastewater)",
           color = 'Data type') +
      theme_minimal() +
      scale_x_date(breaks = epiweek_start,
                   labels = function(d) format(d, "%b %d"),
                   sec.axis = dup_axis(
                     labels = function(d) epiweek(d),
                     name = 'Epi Week'
                   )) +
      theme(axis.text.x = element_text(angle = 90, vjust = 0.5),
            axis.text.x.top = element_text(angle = 90, vjust = 0.5)) +
      annotate("text", label = paste('Slope =', as.character(round(slope, 6))),
               x = as.Date("2022-11-14"),
               y = 0.5)

    results[[as.character(i)]] <- list(
      plot = p,
      slope = slope,
      model = model
    )
  }
  return(results)
}

