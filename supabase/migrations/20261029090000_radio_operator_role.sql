-- Radio operator (docs/STATION_OPERATOR_GUIDE.md, "Operator console"): the
-- station's control operator, who may use the operator console without being an
-- admin. Added alone (new enum value).
alter type public.app_role add value if not exists 'radio_operator';
