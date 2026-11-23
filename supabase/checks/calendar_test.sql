-- Supplier calendar test (migration 0027). Paste into the Supabase SQL editor
-- and Run. It exercises block_time, release_block, move_booking, arrange_time,
-- supplier_slots and the read policy as a temporary admin and as a stranger,
-- then ENDS WITH A DELIBERATE ERROR so that everything it did is rolled back:
-- no data is kept, and (because webhooks queue inside the transaction) no
-- emails are sent. Read the report in the error message:
--     ERROR: CALENDAR TEST REPORT ... ok   ... / FAIL ...
-- Every line should start with "ok". Safe on staging or production.

do $$
declare
  rep    text := '';
  me     uuid := gen_random_uuid();
  nobody uuid := gen_random_uuid();
  sup    uuid;
  tz     text := 'Australia/Brisbane';
  d_tue  date;
  d_sat  date;
  s1     timestamptz;   -- Tuesday 9 am
  s2     timestamptz;   -- Tuesday 11 am
  s3     timestamptz;   -- Tuesday 1 pm
  sat6   timestamptz;   -- Saturday 6 pm
  blk    uuid;
  n      integer;
  fr     boolean;
  v_txt  text;
  v_ts   timestamptz;
  v_st   text;
begin
  -- a temporary admin (rolled back with everything else)
  insert into public.app_admin_emails (email) values ('calendar-test@example.com') on conflict do nothing;
  perform set_config('request.jwt.claims',
    json_build_object('sub', me, 'email', 'calendar-test@example.com', 'role', 'authenticated')::text, true);

  select id into sup from public.suppliers order by created_at, id limit 1;
  rep := rep || E'\nsupplier under test: ' || sup;

  -- a Tuesday and the Saturday after it, 3 to 4 weeks out
  d_tue := (now() at time zone tz)::date + 21;
  while extract(isodow from d_tue) <> 2 loop d_tue := d_tue + 1; end loop;
  d_sat := d_tue + 4;
  s1   := (d_tue + time '09:00') at time zone tz;
  s2   := (d_tue + time '11:00') at time zone tz;
  s3   := (d_tue + time '13:00') at time zone tz;
  sat6 := (d_sat + time '18:00') at time zone tz;

  -- ---------- labels ----------
  select public._time_label(s1, s1 + interval '2 hours', tz) into v_txt;
  rep := rep || E'\n' || case when v_txt = to_char(d_tue, 'Dy FMDD Mon') || ', 9 am – 11 am' then 'ok   ' else 'FAIL ' end
         || 'time label reads like "Tue 15 Dec, 9 am – 11 am": ' || v_txt;

  -- ---------- supplier_slots ----------
  select count(*), bool_or(slot_start = s1 and free) into n, fr from public.supplier_slots(sup, d_tue, d_tue);
  rep := rep || E'\n' || case when n >= 1 and fr then 'ok   ' else 'FAIL ' end || 'supplier_slots lists the day with 9 am free (' || n || ' slots)';

  -- ---------- block / release ----------
  blk := public.block_time(sup, s1, s1 + interval '2 hours', 'test block');
  select free into fr from public.supplier_slots(sup, d_tue, d_tue) where slot_start = s1;
  rep := rep || E'\n' || case when blk is not null and fr = false then 'ok   ' else 'FAIL ' end || 'a block makes its slot not free for the supplier';
  select free into fr from public.available_slots(sup, d_tue, d_tue) where slot_start = s1;
  rep := rep || E'\n' || case when fr = false then 'ok   ' else 'FAIL ' end || 'a block makes its slot not free for customers';

  begin
    perform public.block_time(sup, s1, s1 + interval '1 hour', 'overlap');
    rep := rep || E'\nFAIL an overlapping block was accepted';
  exception when others then
    rep := rep || E'\n' || case when sqlerrm like '%overlaps%' then 'ok   ' else 'FAIL ' end || 'an overlapping block is refused: ' || sqlerrm;
  end;
  begin
    perform public.block_time(sup, s1 + interval '1 hour', s1, 'backwards');
    rep := rep || E'\nFAIL an end before the start was accepted';
  exception when others then
    rep := rep || E'\n' || case when sqlerrm like '%end must be after%' then 'ok   ' else 'FAIL ' end || 'end before start is refused: ' || sqlerrm;
  end;
  begin
    perform public.block_time(sup, s1, s1 + interval '30 days', 'too long');
    rep := rep || E'\nFAIL a 30-day block was accepted';
  exception when others then
    rep := rep || E'\n' || case when sqlerrm like '%at most 14 days%' then 'ok   ' else 'FAIL ' end || 'over 14 days is refused: ' || sqlerrm;
  end;

  perform public.release_block(blk);
  select free into fr from public.supplier_slots(sup, d_tue, d_tue) where slot_start = s1;
  rep := rep || E'\n' || case when fr = true then 'ok   ' else 'FAIL ' end || 'removing a block frees the slot';

  -- ---------- a customer booking, then move it ----------
  perform public.create_booking(
    jsonb_build_object('id', 'HQ-CAL-T1', 'request_type', 'booking', 'status', 'open', 'location', 'cal-test',
      'name', 'CAL TEST', 'selected_supplier_id', sup, 'after_hours', false,
      'preferred_time', public._time_label(s1, s1 + interval '2 hours', tz) || ' — keep me'),
    s1);
  select state into v_st from public.appointments where request_id = 'HQ-CAL-T1';
  rep := rep || E'\n' || case when v_st = 'held' then 'ok   ' else 'FAIL ' end || 'a customer booking holds its slot (' || coalesce(v_st, 'none') || ')';

  begin
    perform public.block_time(sup, s1, s1 + interval '2 hours', 'over a job');
    rep := rep || E'\nFAIL a block over a booked job was accepted';
  exception when others then
    rep := rep || E'\n' || case when sqlerrm like '%overlaps%' then 'ok   ' else 'FAIL ' end || 'a block cannot cover a booked job: ' || sqlerrm;
  end;

  perform public.move_booking('HQ-CAL-T1', s2);
  select starts_at into v_ts from public.appointments where request_id = 'HQ-CAL-T1' and state in ('held', 'confirmed');
  rep := rep || E'\n' || case when v_ts = s2 then 'ok   ' else 'FAIL ' end || 'move_booking moves the held slot';
  select scheduled_start, preferred_time into v_ts, v_txt from public.requests where id = 'HQ-CAL-T1';
  rep := rep || E'\n' || case when v_ts = s2 and v_txt = to_char(d_tue, 'Dy FMDD Mon') || ', 11 am – 1 pm — keep me' then 'ok   ' else 'FAIL ' end
         || 'the request shows the new time and keeps the customer''s note: ' || coalesce(v_txt, 'null');
  select free into fr from public.supplier_slots(sup, d_tue, d_tue) where slot_start = s1;
  rep := rep || E'\n' || case when fr = true then 'ok   ' else 'FAIL ' end || 'the old slot is free again after the move';

  -- a second booking in the 1 pm slot, then try to move onto it
  perform public.create_booking(
    jsonb_build_object('id', 'HQ-CAL-T2', 'request_type', 'booking', 'status', 'open', 'location', 'cal-test',
      'name', 'CAL TEST 2', 'selected_supplier_id', sup, 'after_hours', false), s3);
  begin
    perform public.move_booking('HQ-CAL-T1', s3);
    rep := rep || E'\nFAIL moving onto a taken slot was accepted';
  exception when others then
    rep := rep || E'\n' || case when sqlerrm like '%already taken%' then 'ok   ' else 'FAIL ' end || 'moving onto a taken slot is refused: ' || sqlerrm;
  end;
  begin
    perform public.move_booking('HQ-CAL-T1', (d_tue + time '08:00') at time zone tz);
    rep := rep || E'\nFAIL moving to an off-grid hour was accepted';
  exception when others then
    rep := rep || E'\n' || case when sqlerrm like '%open 2-hour slots%' then 'ok   ' else 'FAIL ' end || 'moving to 8 am (off the 2-hour grid) is refused: ' || sqlerrm;
  end;
  begin
    perform public.move_booking('HQ-CAL-T1', now() - interval '1 day');
    rep := rep || E'\nFAIL moving into the past was accepted';
  exception when others then
    rep := rep || E'\n' || case when sqlerrm like '%in the future%' then 'ok   ' else 'FAIL ' end || 'moving into the past is refused: ' || sqlerrm;
  end;
  begin
    perform public.move_booking('HQ-NOPE', s3);
    rep := rep || E'\nFAIL an unknown booking was accepted';
  exception when others then
    rep := rep || E'\n' || case when sqlerrm like '%not allowed%' then 'ok   ' else 'FAIL ' end || 'an unknown booking is refused: ' || sqlerrm;
  end;

  -- ---------- after-hours: arrange a time ----------
  perform public.create_request(jsonb_build_object('id', 'HQ-CAL-AH', 'request_type', 'booking', 'status', 'open',
    'location', 'cal-test', 'name', 'CAL AFTER HOURS', 'selected_supplier_id', sup, 'after_hours', true,
    'preferred_time', 'After-hours callout, Sat (before working hours) — gate code 1234'));
  insert into public.quotes (id, request_id, supplier_id, is_booking, price_low, price_high, status, quote_type)
  values ('Q-CAL-AH', 'HQ-CAL-AH', sup, true, 100, 100, 'confirmed', 'auto');

  begin
    perform public.arrange_time('HQ-CAL-T1', sat6, sat6 + interval '2 hours');
    rep := rep || E'\nFAIL arranging a normal booking was accepted';
  exception when others then
    rep := rep || E'\n' || case when sqlerrm like '%only after-hours%' then 'ok   ' else 'FAIL ' end || 'only after-hours jobs can be arranged: ' || sqlerrm;
  end;
  begin
    perform public.arrange_time('HQ-CAL-AH', sat6, sat6 + interval '30 minutes');
    rep := rep || E'\nFAIL a 30-minute visit was accepted';
  exception when others then
    rep := rep || E'\n' || case when sqlerrm like '%between 1 and 12 hours%' then 'ok   ' else 'FAIL ' end || 'visits must be 1 to 12 hours: ' || sqlerrm;
  end;

  perform public.arrange_time('HQ-CAL-AH', sat6, sat6 + interval '2 hours');
  select state into v_st from public.appointments where request_id = 'HQ-CAL-AH' and kind = 'job';
  rep := rep || E'\n' || case when v_st = 'confirmed' then 'ok   ' else 'FAIL ' end || 'an arranged time goes on the calendar as confirmed (' || coalesce(v_st, 'none') || ')';
  select scheduled_start, preferred_time into v_ts, v_txt from public.requests where id = 'HQ-CAL-AH';
  rep := rep || E'\n' || case when v_ts = sat6 and v_txt = 'After-hours callout: ' || to_char(d_sat, 'Dy FMDD Mon') || ', 6 pm – 8 pm — gate code 1234' then 'ok   ' else 'FAIL ' end
         || 'the request shows the arranged time and keeps the note: ' || coalesce(v_txt, 'null');

  begin
    perform public.arrange_time('HQ-CAL-AH', sat6 + interval '3 hours', sat6 + interval '5 hours');
    rep := rep || E'\nFAIL arranging twice was accepted';
  exception when others then
    rep := rep || E'\n' || case when sqlerrm like '%already arranged%' then 'ok   ' else 'FAIL ' end || 'a second arrangement is refused: ' || sqlerrm;
  end;
  begin
    perform public.block_time(sup, sat6, sat6 + interval '1 hour', 'over arranged');
    rep := rep || E'\nFAIL a block over an arranged time was accepted';
  exception when others then
    rep := rep || E'\n' || case when sqlerrm like '%overlaps%' then 'ok   ' else 'FAIL ' end || 'a block cannot cover an arranged time: ' || sqlerrm;
  end;

  -- ---------- the quote decides the slot (0026 trigger) ----------
  update public.quotes set status = 'rejected' where id = 'Q-CAL-AH';
  select state into v_st from public.appointments where request_id = 'HQ-CAL-AH' and kind = 'job';
  rep := rep || E'\n' || case when v_st = 'released' then 'ok   ' else 'FAIL ' end || 'rejecting the quote releases the arranged time (' || coalesce(v_st, 'none') || ')';
  begin
    perform public.arrange_time('HQ-CAL-AH', sat6, sat6 + interval '2 hours');
    rep := rep || E'\nFAIL arranging a declined booking was accepted';
  exception when others then
    rep := rep || E'\n' || case when sqlerrm like '%declined%' then 'ok   ' else 'FAIL ' end || 'a declined booking cannot be arranged: ' || sqlerrm;
  end;

  -- ---------- the read policy (as the real "authenticated" role) ----------
  execute 'set local role authenticated';
  select count(*) into n from public.appointments;
  rep := rep || E'\n' || case when n >= 2 then 'ok   ' else 'FAIL ' end || 'an admin can read appointments (' || n || ' rows)';

  -- ---------- a stranger: signed in, neither admin nor supplier ----------
  perform set_config('request.jwt.claims',
    json_build_object('sub', nobody, 'email', 'stranger@example.com', 'role', 'authenticated')::text, true);
  select count(*) into n from public.appointments;
  rep := rep || E'\n' || case when n = 0 then 'ok   ' else 'FAIL ' end || 'a stranger reads no appointments (' || n || ' rows)';

  begin perform public.block_time(sup, s1, s1 + interval '2 hours', 'x');
    rep := rep || E'\nFAIL a stranger could block time';
  exception when others then rep := rep || E'\n' || case when sqlerrm like '%not allowed%' then 'ok   ' else 'FAIL ' end || 'a stranger cannot block time: ' || sqlerrm; end;
  begin perform public.move_booking('HQ-CAL-T1', s3);
    rep := rep || E'\nFAIL a stranger could move a booking';
  exception when others then rep := rep || E'\n' || case when sqlerrm like '%not allowed%' then 'ok   ' else 'FAIL ' end || 'a stranger cannot move a booking: ' || sqlerrm; end;
  begin perform public.arrange_time('HQ-CAL-AH', sat6, sat6 + interval '2 hours');
    rep := rep || E'\nFAIL a stranger could arrange a time';
  exception when others then rep := rep || E'\n' || case when sqlerrm like '%not allowed%' then 'ok   ' else 'FAIL ' end || 'a stranger cannot arrange a time: ' || sqlerrm; end;
  begin perform public.supplier_slots(sup, d_tue, d_tue);
    rep := rep || E'\nFAIL a stranger could list supplier slots';
  exception when others then rep := rep || E'\n' || case when sqlerrm like '%not allowed%' then 'ok   ' else 'FAIL ' end || 'a stranger cannot list supplier slots: ' || sqlerrm; end;
  begin perform public.release_block(blk);
    rep := rep || E'\nFAIL a stranger could remove a block';
  exception when others then rep := rep || E'\n' || case when sqlerrm like '%not allowed%' then 'ok   ' else 'FAIL ' end || 'a stranger cannot remove a block: ' || sqlerrm; end;

  execute 'reset role';

  -- Roll everything back: this error is the way the report is shown.
  raise exception E'CALENDAR TEST REPORT (nothing was saved):%', rep;
end $$;
