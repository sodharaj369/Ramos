delete from public.lead_history where lead_id in (select id from public.leads where attributes->>'place_id' = 'ChIJtest1');
delete from public.leads where attributes->>'place_id' = 'ChIJtest1';
delete from public.provider_usage where job_id = 'bb45c218-84e0-49ad-be9e-6ceb045c6f4d';
delete from public.jobs where id = 'bb45c218-84e0-49ad-be9e-6ceb045c6f4d';