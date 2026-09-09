-- Seed data for a fresh project (the staging DB).
--
-- Just enough for the app to render and for the smoke / RLS tests to pass:
-- the two demo suppliers and their pricing, copied from production on
-- 2026-09-10. No requests / quotes / connections — those get created by the
-- test flows. `auth_user_id` is left null; the "Coastal Hydraulics Co"
-- supplier links itself when someone signs in as hosequote@gmail.com and
-- claim_supplier() runs.
--
-- Idempotent: safe to run more than once.

insert into public.suppliers (id, company_name, service_area, contact_email, contact_phone, auth_user_id)
values
  ('29c8dd2b-979b-4fce-ac77-51a1a92b05eb', 'Coastal Hydraulics Co', '', 'hosequote@gmail.com', '07 5555 0101', null),
  ('0f94d42d-0c94-4067-97ae-283cc1bbea42', 'HoseQuote',             '', 'hosequote@gmail.com', '07 5555 0202', null)
on conflict (id) do update set
  company_name  = excluded.company_name,
  service_area  = excluded.service_area,
  contact_email = excluded.contact_email,
  contact_phone = excluded.contact_phone;

insert into public.supplier_pricing
  (supplier_id, hose, fitting, labour_base, crimp_charge, travel_base, callout_fee, labour_hourly_rate)
values
  ('29c8dd2b-979b-4fce-ac77-51a1a92b05eb',
   '{"hydraulic_oil_1_4":{"label":"Hydraulic Oil — 1/4\" (6mm)","price":12,"partNumber":""},"hydraulic_oil_3_8":{"label":"Hydraulic Oil — 3/8\" (10mm)","price":18,"partNumber":""},"hydraulic_oil_1_2":{"label":"Hydraulic Oil — 1/2\" (13mm)","price":24,"partNumber":""},"hydraulic_oil_5_8":{"label":"Hydraulic Oil — 5/8\" (16mm)","price":30,"partNumber":""},"hydraulic_oil_3_4":{"label":"Hydraulic Oil — 3/4\" (19mm)","price":36,"partNumber":""},"pressure_washer_1_4":{"label":"Pressure Washer — 1/4\" (6mm)","price":20,"partNumber":""},"pressure_washer_3_8":{"label":"Pressure Washer — 3/8\" (10mm)","price":28,"partNumber":""},"pressure_washer_1_2":{"label":"Pressure Washer — 1/2\" (13mm)","price":36,"partNumber":""}}'::jsonb,
   '{"BSP Male":{"label":"BSP Male","price":8,"partNumber":""},"BSP Female":{"label":"BSP Female","price":9,"partNumber":""},"JIC 37° Male":{"label":"JIC 37° Male","price":12,"partNumber":""},"JIC 37° Female":{"label":"JIC 37° Female","price":14,"partNumber":""},"NPT Male":{"label":"NPT Male","price":7,"partNumber":""},"NPT Female":{"label":"NPT Female","price":8,"partNumber":""},"ORFS Male":{"label":"ORFS Male","price":15,"partNumber":""},"ORFS Female":{"label":"ORFS Female","price":17,"partNumber":""},"SAE Flange":{"label":"SAE Flange","price":25,"partNumber":""}}'::jsonb,
   120, 15, 80, 120, 120),
  ('0f94d42d-0c94-4067-97ae-283cc1bbea42',
   '{"hydraulic_oil_1_4":{"label":"Hydraulic Oil — 1/4\" (6mm)","price":11,"partNumber":""},"hydraulic_oil_3_8":{"label":"Hydraulic Oil — 3/8\" (10mm)","price":17,"partNumber":""},"hydraulic_oil_1_2":{"label":"Hydraulic Oil — 1/2\" (13mm)","price":23,"partNumber":""},"hydraulic_oil_5_8":{"label":"Hydraulic Oil — 5/8\" (16mm)","price":29,"partNumber":""},"hydraulic_oil_3_4":{"label":"Hydraulic Oil — 3/4\" (19mm)","price":34,"partNumber":""},"pressure_washer_1_4":{"label":"Pressure Washer — 1/4\" (6mm)","price":19,"partNumber":""},"pressure_washer_3_8":{"label":"Pressure Washer — 3/8\" (10mm)","price":27,"partNumber":""},"pressure_washer_1_2":{"label":"Pressure Washer — 1/2\" (13mm)","price":34,"partNumber":""}}'::jsonb,
   '{"BSP Male":{"label":"BSP Male","price":8,"partNumber":""},"BSP Female":{"label":"BSP Female","price":9,"partNumber":""},"JIC 37° Male":{"label":"JIC 37° Male","price":11,"partNumber":""},"JIC 37° Female":{"label":"JIC 37° Female","price":13,"partNumber":""},"NPT Male":{"label":"NPT Male","price":7,"partNumber":""},"NPT Female":{"label":"NPT Female","price":8,"partNumber":""},"ORFS Male":{"label":"ORFS Male","price":14,"partNumber":""},"ORFS Female":{"label":"ORFS Female","price":16,"partNumber":""},"SAE Flange":{"label":"SAE Flange","price":24,"partNumber":""}}'::jsonb,
   60, 15, 80, 120, 120)
on conflict (supplier_id) do update set
  hose               = excluded.hose,
  fitting            = excluded.fitting,
  labour_base        = excluded.labour_base,
  crimp_charge       = excluded.crimp_charge,
  travel_base        = excluded.travel_base,
  callout_fee        = excluded.callout_fee,
  labour_hourly_rate = excluded.labour_hourly_rate;
