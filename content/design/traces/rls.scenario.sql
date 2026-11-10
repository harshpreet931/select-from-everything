-- @title one notes table with a tenant policy, read as six different roles
-- @engine pglite
-- @each

-- schemas-roles-and-rls reads these for its RunPick. every role is a real role, switched with SET ROLE.

-- @step T1 "a notes table owned by an ordinary role, rows for two tenants, and a policy: you see your tenant's rows, named by app.tenant."
CREATE ROLE rls_owner;
CREATE ROLE rls_clerk;
CREATE ROLE rls_auditor BYPASSRLS;
CREATE TABLE notes (id int PRIMARY KEY, tenant text NOT NULL, body text NOT NULL);
ALTER TABLE notes OWNER TO rls_owner;
INSERT INTO notes VALUES (1, 'acme', 'renew the lease'), (2, 'acme', 'order teapots'), (3, 'globex', 'quarterly numbers');
GRANT SELECT, INSERT ON notes TO rls_clerk, rls_auditor;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_rows ON notes USING (tenant = current_setting('app.tenant', true));

-- @step T1 "the clerk, working for acme. no WHERE in the query; the policy adds one."
SET app.tenant = 'acme';
SET ROLE rls_clerk;
SELECT id, tenant, body FROM notes ORDER BY id;

-- @step T1 "the same clerk, same query, working for globex."
RESET ROLE;
SET app.tenant = 'globex';
SET ROLE rls_clerk;
SELECT id, tenant, body FROM notes ORDER BY id;

-- @step T1 "the clerk with no tenant set: current_setting returns NULL, the policy is never true, and the clerk sees nothing."
RESET ROLE;
RESET app.tenant;
SET ROLE rls_clerk;
SELECT id, tenant, body FROM notes ORDER BY id;

-- @step T1 errors=42501 "the acme clerk tries to write a note for globex. with only USING, the policy's expression is also the check for new rows, and this row fails it."
RESET ROLE;
SET app.tenant = 'acme';
SET ROLE rls_clerk;
INSERT INTO notes VALUES (4, 'globex', 'sneaky');

-- @step T1 "the table's owner: policies don't apply to the owner, so it sees every row."
RESET ROLE;
SET app.tenant = 'acme';
SET ROLE rls_owner;
SELECT id, tenant, body FROM notes ORDER BY id;

-- @step T1 "FORCE ROW LEVEL SECURITY makes the owner subject to the policy too."
RESET ROLE;
ALTER TABLE notes FORCE ROW LEVEL SECURITY;
SET app.tenant = 'acme';
SET ROLE rls_owner;
SELECT id, tenant, body FROM notes ORDER BY id;

-- @step T1 "a role created with BYPASSRLS ignores policies, even forced ones."
RESET ROLE;
SET ROLE rls_auditor;
SELECT id, tenant, body FROM notes ORDER BY id;

-- @step T1 "and a superuser (postgres, who set all this up) always bypasses them."
RESET ROLE;
SELECT id, tenant, body FROM notes ORDER BY id;
