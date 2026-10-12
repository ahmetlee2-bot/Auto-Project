-- Existing listings have no recorded target margin. Do not reprice them using a guessed value.
update public.tracked_products
set active = false,
    last_error = 'Übernommenes Angebot: Zielmarge prüfen und Überwachung anschließend fortsetzen.',
    updated_at = now()
where last_checked_at is null
  and amazon_price is null
  and sync_status = 'error';
