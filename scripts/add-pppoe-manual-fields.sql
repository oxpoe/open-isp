-- Add PPPoE manual input fields
ALTER TABLE customers ADD COLUMN pppoe_password TEXT DEFAULT '';
ALTER TABLE customers ADD COLUMN pppoe_remote_address TEXT DEFAULT '';

-- Made with Bob
