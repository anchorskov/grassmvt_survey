SELECT s.slug, s.title, COUNT(v.id) as versions FROM surveys s LEFT JOIN survey_versions v ON v.survey_id = s.id WHERE s.slug = 'abortion' GROUP BY s.id;
SELECT 'Survey versions for abortion:' as info;
SELECT v.id, v.version, v.json_hash FROM surveys s JOIN survey_versions v ON v.survey_id = s.id WHERE s.slug = 'abortion' ORDER BY v.version;
