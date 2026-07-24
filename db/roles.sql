CREATE ROLE scraper_rw LOGIN PASSWORD '{{SCRAPER_RW_PASSWORD}}';
CREATE ROLE webapp_ro LOGIN PASSWORD '{{WEBAPP_RO_PASSWORD}}';

GRANT USAGE ON SCHEMA public TO scraper_rw;
GRANT USAGE ON SCHEMA public TO webapp_ro;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE semesters, groups, courses, sessions TO scraper_rw;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO scraper_rw;

GRANT SELECT ON TABLE semesters, groups, courses, sessions TO webapp_ro;
